import * as z from "zod";
import {
  AhpErrorCodes as AHPErrorCodes,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
  PROTOCOL_VERSION as AHP_PROTOCOL_VERSION,
} from "@microsoft/agent-host-protocol";
import type {
  CreateSessionParams as AHPCreateSessionParams,
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
import { callDoRpc } from "../../shared/do-rpc";
import { errorMessage } from "../../shared/errors";
import { parseChannel } from "../../shared/lookups";
import { AHPError } from "../../shared/protocol";
import { toAHPError } from "../../shared/rpc/errors";
import { SessionDispatchActionSchema } from "../../shared/rpc/session";
import type { AgentHostConnectionRouterDeps } from "../dependencies";
import { CloseCode, send, sendError } from "../websockets";
import type { Frame } from "./client-connection";
import type { Subscriptions } from "./subscriptions";

const AttachmentSchema = z.object({ clientId: z.string().optional() }).nullable();

type RequestResult = AHPInitializeResult | AHPListSessionsResult | AHPSubscribeResult | null;

/**
 * Handles the client frames of one connection. It parses each frame, runs the AHP request or
 * notification, and sends the reply on the socket.
 *
 * The router answers `initialize` and `ping`, sends `listSessions` and root subscriptions to
 * the host, and sends all session requests, including `createSession` and `disposeSession`,
 * directly to the sessions.
 */
export class ClientRequestsRouter {
  private deps: AgentHostConnectionRouterDeps;
  private subscriptions: Subscriptions;

  constructor(deps: AgentHostConnectionRouterDeps, subscriptions: Subscriptions) {
    this.deps = deps;
    this.subscriptions = subscriptions;
  }

  /** Sends a reply with a null ID if the frame is not a valid JSON-RPC message. */
  async handleFrame(socket: WebSocket, raw: string | ArrayBuffer, frame: Frame): Promise<void> {
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
      await this.handleNotification(socket, message, frame);

      return;
    }

    await this.handleRequest(socket, message.id, message, frame);
  }

  private async handleRequest(
    socket: WebSocket,
    id: string | number,
    message: JsonRpcCall,
    frame: Frame,
  ): Promise<void> {
    try {
      const result = await this.runRequest(socket, message, frame);
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

  /** Runs the handler for an AHP request and returns its result. */
  private async runRequest(
    socket: WebSocket,
    message: JsonRpcCall,
    frame: Frame,
  ): Promise<RequestResult> {
    const { method, params } = message;

    switch (method) {
      case "initialize": {
        return await this.initialize(socket, AHPInitializeParamsSchema.parse(params), frame);
      }

      case "ping": {
        AHPRootChannelParamsSchema.parse(params);

        return null;
      }

      default: {
        break;
      }
    }

    this.requireClientId(socket);

    switch (method) {
      case "subscribe": {
        const { channel } = AHPSubscribeParamsSchema.parse(params);
        const [snapshot] = await this.subscribe([channel], frame);

        return { snapshot };
      }

      case "listSessions": {
        AHPListSessionsParamsSchema.parse(params);

        return await this.deps.stubs.host().listSessions();
      }

      case "createSession": {
        const create = AHPCreateSessionParamsSchema.parse(params);
        await this.createSession(create);

        return null;
      }

      case "disposeSession": {
        const { channel } = AHPChannelParamsSchema.parse(params);
        await this.disposeSession(channel);

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

  private async handleNotification(
    socket: WebSocket,
    { method, params }: JsonRpcCall,
    frame: Frame,
  ): Promise<void> {
    try {
      switch (method) {
        case "dispatchAction": {
          await this.dispatchAction(socket, params, frame);
          break;
        }

        case "unsubscribe": {
          this.requireClientId(socket);
          await this.subscriptions.unsubscribe(AHPChannelParamsSchema.parse(params).channel);
          break;
        }

        default: {
          break;
        }
      }
    } catch {
      // A JSON-RPC notification has no reply, so the router ignores a failed notification.
    }
  }

  /**
   * Runs the AHP handshake.
   * The router stores the client ID only after the snapshots of the initial subscriptions load.
   */
  private async initialize(
    socket: WebSocket,
    params: AHPInitializeParams,
    frame: Frame,
  ): Promise<AHPInitializeResult> {
    if (this.clientId(socket) !== undefined) {
      throw new AHPError("Connection is already initialized");
    }

    if (!params.protocolVersions.includes(AHP_PROTOCOL_VERSION)) {
      throw new AHPError("Unsupported protocol version", AHPErrorCodes.UnsupportedProtocolVersion, {
        supportedVersions: [AHP_PROTOCOL_VERSION],
      });
    }

    const channels = [...new Set(params.initialSubscriptions)];
    const snapshots = await this.subscribe(channels, frame);
    socket.serializeAttachment({ clientId: params.clientId });

    return {
      protocolVersion: AHP_PROTOCOL_VERSION,
      serverSeq: this.deps.sequence.current(),
      snapshots,
    };
  }

  /**
   * Subscribes the client to the channels. Each snapshot starts at the current `serverSeq`,
   * because the router sends the updates that follow it after the reply.
   */
  private async subscribe(channels: string[], frame: Frame): Promise<AHPSnapshot[]> {
    const snapshots = await this.subscriptions.subscribe(channels, frame);
    const fromSeq = this.deps.sequence.current();

    return snapshots.map(({ channel, state }) => ({ resource: channel, state, fromSeq }));
  }

  /** Returns the client ID set by `initialize`, or undefined before initialization. */
  private clientId(socket: WebSocket): string | undefined {
    return AttachmentSchema.parse(socket.deserializeAttachment())?.clientId;
  }

  private requireClientId(socket: WebSocket): string {
    const clientId = this.clientId(socket);

    if (clientId === undefined) {
      throw new AHPError("Initialize the connection first", AHPJsonRpcErrorCodes.InvalidRequest);
    }

    return clientId;
  }

  /**
   * Sends a create request to the session. The session waits for the host catalog, so
   * `listSessions` has the session when the request resolves. A repeated create joins the
   * creation, so the router can retry the call after a Durable Object reset.
   */
  private async createSession(params: AHPCreateSessionParams): Promise<void> {
    const sessionId = this.sessionIdOf(params.channel);

    await callDoRpc(
      () => this.deps.stubs.session(sessionId),
      async (session) => {
        await session.create(params);
      },
    );
  }

  /**
   * Sends a dispose request to the session. A retry after a retryable failure can find the
   * session absent, because the first attempt finished. Thus `SessionNotFound` after a retry
   * counts as success.
   */
  private async disposeSession(channel: string): Promise<void> {
    const sessionId = this.sessionIdOf(channel);

    await callDoRpc(
      () => this.deps.stubs.session(sessionId),
      async (session, attempt) => {
        try {
          await session.dispose();
        } catch (error) {
          const failure = toAHPError(error);

          if (attempt === 1 || failure.code !== AHPErrorCodes.SessionNotFound) {
            throw error;
          }
        }
      },
    );
  }

  /**
   * Returns the session ID of a session channel.
   *
   * @throws {AHPError} If the channel is not an `ahp-session` channel.
   */
  private sessionIdOf(channel: string): string {
    const parsed = parseChannel(channel);

    if (parsed.kind !== "session") {
      throw new AHPError("Expected an ahp-session channel");
    }

    return parsed.sessionId;
  }

  /**
   * Sends a client action to the session that owns the chat channel.
   * Only the client that sent the action receives a rejection.
   * Subscribers receive an accepted action as a push from the session.
   */
  private async dispatchAction(
    socket: WebSocket,
    params: JsonRpcCall["params"],
    frame: Frame,
  ): Promise<void> {
    const clientId = this.requireClientId(socket);
    const submitted = AHPDispatchActionParamsSchema.parse(params);
    const origin = { clientId, clientSeq: submitted.clientSeq };

    try {
      const parsed = parseChannel(submitted.channel);

      if (parsed.kind !== "chat") {
        throw new AHPError("Actions must target a chat channel");
      }

      const action = SessionDispatchActionSchema.parse(submitted.action);

      // The router does not retry the dispatch.
      // If the session applied a turn start, it rejects a retry of that turn start.
      await this.deps.stubs.session(parsed.sessionId).dispatch({
        channel: submitted.channel,
        action,
        origin,
      });
    } catch (error) {
      // A closed connection has no storage for the `serverSeq` of the rejection.
      if (!frame.isCurrent()) {
        return;
      }

      const [serverSeq] = this.deps.sequence.increment(1);

      send(socket, {
        jsonrpc: "2.0",
        method: "action",
        params: {
          channel: submitted.channel,
          action: submitted.action,
          origin,
          serverSeq,
          rejectionReason: errorMessage(error),
        },
      });
    }
  }
}
