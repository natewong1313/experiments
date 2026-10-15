import {
  AhpErrorCodes as AHPErrorCodes,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
  PROTOCOL_VERSION as AHP_PROTOCOL_VERSION,
} from "@microsoft/agent-host-protocol";
import type {
  InitializeParams as AHPInitializeParams,
  InitializeResult as AHPInitializeResult,
  ListSessionsResult as AHPListSessionsResult,
  Snapshot as AHPSnapshot,
  SubscribeResult as AHPSubscribeResult,
} from "@experiments/protocol-schemas/ahp";
import {
  ChannelParamsSchema as AHPChannelParamsSchema,
  CreateSessionParamsSchema as AHPCreateSessionParamsSchema,
  DispatchActionParamsSchema as AHPDispatchActionParamsSchema,
  InitializeParamsSchema as AHPInitializeParamsSchema,
  ListSessionsParamsSchema as AHPListSessionsParamsSchema,
  RootChannelParamsSchema as AHPRootChannelParamsSchema,
  SubscribeParamsSchema as AHPSubscribeParamsSchema,
} from "@experiments/protocol-schemas/ahp";
import { JsonRpcCallSchema } from "@experiments/protocol-schemas";
import type { JsonRpcCall } from "@experiments/protocol-schemas";
import { errorMessage } from "../shared/errors";
import { AHPError, toAHPError } from "../shared/protocol";
import type { ConnectionsService } from "./service/connections";
import type { HostSessionsService } from "./service/sessions";
import { CloseCode, send, sendError } from "./websockets";

type RouterOptions = { sessions: HostSessionsService; connections: ConnectionsService };

type RequestResult = AHPInitializeResult | AHPListSessionsResult | AHPSubscribeResult | null;

/**
 * Routes the JSON-RPC messages of host clients.
 * The router does the AHP handshake. After the handshake, it sends each method to the services.
 */
export class AHPRouter {
  private sessions: HostSessionsService;
  private connections: ConnectionsService;

  constructor(options: RouterOptions) {
    this.sessions = options.sessions;
    this.connections = options.connections;
  }

  /** Handles one WebSocket frame after all earlier frames from the same socket. */
  async handleMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.connections.serialize(socket, () => this.handleFrame(socket, raw));
  }

  /** Sends a reply with a null ID if the frame is not a valid JSON-RPC message. */
  private async handleFrame(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: JsonRpcCall;

    try {
      if (raw instanceof ArrayBuffer) {
        throw new AHPError("Expected a text frame", AHPJsonRpcErrorCodes.InvalidRequest);
      }

      message = JsonRpcCallSchema.parse(JSON.parse(raw));
    } catch (error) {
      sendError(socket, null, toAHPError(error));

      return;
    }

    if (message.id === undefined) {
      await this.handleNotification(socket, message);

      return;
    }

    await this.handleRequest(socket, message.id, message);
  }

  private async handleRequest(
    socket: WebSocket,
    id: string | number,
    message: JsonRpcCall,
  ): Promise<void> {
    try {
      const result = await this.request(socket, message);
      send(socket, { jsonrpc: "2.0", id, result });
    } catch (error) {
      const failure = toAHPError(error);
      sendError(socket, id, failure);

      // A client without a supported protocol version cannot continue.
      if (failure.code === AHPErrorCodes.UnsupportedProtocolVersion) {
        socket.close(CloseCode.Normal, failure.message);
      }
    }
  }

  private async handleNotification(
    socket: WebSocket,
    { method, params }: JsonRpcCall,
  ): Promise<void> {
    try {
      switch (method) {
        case "dispatchAction": {
          await this.dispatchAction(socket, params);
          break;
        }

        case "unsubscribe": {
          this.requireClientId(socket);
          this.connections.unsubscribe(socket, AHPChannelParamsSchema.parse(params).channel);
          break;
        }

        default: {
          break;
        }
      }
    } catch {
      // JSON-RPC gives notifications no way to report a failure, so the router drops it.
    }
  }

  /**
   * Route AHP reqs to matching handlers.
   */
  private async request(socket: WebSocket, message: JsonRpcCall): Promise<RequestResult> {
    const { method, params } = message;

    switch (method) {
      case "initialize": {
        return await this.initialize(socket, AHPInitializeParamsSchema.parse(params));
      }

      case "ping": {
        AHPRootChannelParamsSchema.parse(params);

        return null;
      }

      default: {
        this.requireClientId(socket);

        switch (method) {
          case "subscribe": {
            return await this.subscribe(socket, AHPSubscribeParamsSchema.parse(params).channel);
          }

          case "listSessions": {
            AHPListSessionsParamsSchema.parse(params);

            return await this.sessions.list();
          }

          case "createSession": {
            await this.sessions.create(AHPCreateSessionParamsSchema.parse(params));

            return null;
          }

          case "disposeSession": {
            await this.sessions.dispose(AHPChannelParamsSchema.parse(params).channel);

            return null;
          }

          case "dispatchAction":
          case "unsubscribe": {
            throw new AHPError("Expected a notification", AHPJsonRpcErrorCodes.InvalidRequest);
          }

          default: {
            throw new AHPError("Method is not supported", AHPJsonRpcErrorCodes.MethodNotFound);
          }
        }
      }
    }
  }

  /**
   * Does the AHP handshake.
   * The connection is initialized only after the snapshots of its initial subscriptions load.
   */
  private async initialize(
    socket: WebSocket,
    params: AHPInitializeParams,
  ): Promise<AHPInitializeResult> {
    if (this.connections.clientId(socket) !== undefined) {
      throw new AHPError("Connection is already initialized");
    }

    if (!params.protocolVersions.includes(AHP_PROTOCOL_VERSION)) {
      throw new AHPError("Unsupported protocol version", AHPErrorCodes.UnsupportedProtocolVersion, {
        supportedVersions: [AHP_PROTOCOL_VERSION],
      });
    }

    const serverSeq = this.sessions.serverSeq();
    const snapshots = await this.subscribeAll(socket, [...new Set(params.initialSubscriptions)]);
    this.connections.initialize(socket, params.clientId);

    return { protocolVersion: AHP_PROTOCOL_VERSION, serverSeq, snapshots };
  }

  private async subscribe(socket: WebSocket, channel: string): Promise<AHPSubscribeResult> {
    const [snapshot] = await this.subscribeAll(socket, [channel]);

    return { snapshot };
  }

  /** Subscribes the socket to the channels and returns their snapshots. */
  private async subscribeAll(socket: WebSocket, channels: string[]): Promise<AHPSnapshot[]> {
    return await this.connections.subscribe(
      socket,
      channels,
      async (channel) => await this.sessions.snapshot(channel),
    );
  }

  /**
   * Sends a client action to its session.
   * Only the client that sent the action receives a rejection.
   * All subscribers receive an accepted action as a broadcast.
   */
  private async dispatchAction(socket: WebSocket, params: JsonRpcCall["params"]): Promise<void> {
    const clientId = this.requireClientId(socket);
    const submitted = AHPDispatchActionParamsSchema.parse(params);

    try {
      await this.sessions.dispatch(submitted, clientId);
    } catch (error) {
      send(socket, {
        jsonrpc: "2.0",
        method: "action",
        params: {
          channel: submitted.channel,
          action: submitted.action,
          origin: { clientId, clientSeq: submitted.clientSeq },
          serverSeq: this.sessions.nextServerSeq(),
          rejectionReason: errorMessage(error),
        },
      });
    }
  }

  private requireClientId(socket: WebSocket): string {
    const clientId = this.connections.clientId(socket);

    if (clientId === undefined) {
      throw new AHPError("Initialize the connection first", AHPJsonRpcErrorCodes.InvalidRequest);
    }

    return clientId;
  }
}
