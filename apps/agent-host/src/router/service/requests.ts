import * as z from "zod";
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
import { errorMessage } from "../../shared/errors";
import { channelSender, parseChannel } from "../../shared/lookups";
import { AHPError } from "../../shared/protocol";
import { toAHPError } from "../../shared/rpc/errors";
import { SessionDispatchActionSchema } from "../../shared/rpc/session";
import type { StubFor } from "../../shared/stubs";
import { CloseCode, send, sendError } from "../websockets";
import type { RouterChannels } from "./channels";
import type { FrameScope } from "./connection";
import type { Senders } from "./senders";

const AttachmentSchema = z.object({ clientId: z.string().optional() }).nullable();

type ClientRequestsOptions = {
  channels: RouterChannels;
  senders: Senders;
  host(): StubFor<"host">;
  session(sessionId: string): StubFor<"session">;
};

type RequestResult = AHPInitializeResult | AHPListSessionsResult | AHPSubscribeResult | null;

/**
 * Handles the JSON-RPC messages of one client connection.
 * The router answers `initialize` and `ping`. It sends catalogue requests and root
 * subscriptions to the host, and sends session and chat requests to the session.
 * `RouterConnection` runs one frame at a time and gives each frame its scope.
 */
export class ClientRequests {
  private options: ClientRequestsOptions;
  private channels: RouterChannels;
  private senders: Senders;

  constructor(options: ClientRequestsOptions) {
    this.options = options;
    this.channels = options.channels;
    this.senders = options.senders;
  }

  /** Returns the client ID set by `initialize`, or undefined before initialization. */
  private clientId(socket: WebSocket): string | undefined {
    return AttachmentSchema.parse(socket.deserializeAttachment())?.clientId;
  }

  /** Sends a reply with a null ID if the frame is not a valid JSON-RPC message. */
  async handleFrame(
    socket: WebSocket,
    raw: string | ArrayBuffer,
    frame: FrameScope,
  ): Promise<void> {
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
    frame: FrameScope,
  ): Promise<void> {
    try {
      const result = await this.request(socket, message, frame);
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
    frame: FrameScope,
  ): Promise<void> {
    try {
      switch (method) {
        case "dispatchAction": {
          await this.dispatchAction(socket, params, frame);
          break;
        }

        case "unsubscribe": {
          this.requireClientId(socket);
          await this.unsubscribe(AHPChannelParamsSchema.parse(params).channel);
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

  /** Runs the handler for an AHP request and returns its result. */
  private async request(
    socket: WebSocket,
    message: JsonRpcCall,
    frame: FrameScope,
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
        this.requireClientId(socket);

        switch (method) {
          case "subscribe": {
            const { channel } = AHPSubscribeParamsSchema.parse(params);
            const [snapshot] = await this.subscribe([channel], frame);

            return { snapshot };
          }

          case "listSessions": {
            AHPListSessionsParamsSchema.parse(params);

            return await this.options.host().listSessions();
          }

          case "createSession": {
            await this.options.host().createSession(AHPCreateSessionParamsSchema.parse(params));

            return null;
          }

          case "disposeSession": {
            await this.disposeSession(AHPChannelParamsSchema.parse(params).channel);

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
   * Runs the AHP handshake.
   * The router stores the client ID only after the snapshots of the initial subscriptions load.
   */
  private async initialize(
    socket: WebSocket,
    params: AHPInitializeParams,
    frame: FrameScope,
  ): Promise<AHPInitializeResult> {
    if (this.clientId(socket) !== undefined) {
      throw new AHPError("Connection is already initialized");
    }

    if (!params.protocolVersions.includes(AHP_PROTOCOL_VERSION)) {
      throw new AHPError("Unsupported protocol version", AHPErrorCodes.UnsupportedProtocolVersion, {
        supportedVersions: [AHP_PROTOCOL_VERSION],
      });
    }

    const snapshots = await this.subscribe([...new Set(params.initialSubscriptions)], frame);
    socket.serializeAttachment({ clientId: params.clientId });

    return {
      protocolVersion: AHP_PROTOCOL_VERSION,
      serverSeq: this.channels.serverSeq(),
      snapshots,
    };
  }

  /**
   * Subscribes the client to the channels and returns their snapshots. Pushes from the senders
   * of these channels wait until the client receives the reply.
   *
   * The router stores the subscriptions only if every sender accepts and the connection is
   * still open. Otherwise it tells each sender that accepted a new subscription to stop.
   */
  private async subscribe(channels: string[], frame: FrameScope): Promise<AHPSnapshot[]> {
    const items = channels.map((channel) => ({ channel, parsed: parseChannel(channel) }));
    frame.hold(items.map((item) => channelSender(item.parsed)));

    const results = await Promise.allSettled(
      items.map(async (item) => await this.senders.subscribe(item)),
    );

    const loaded = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const failure = results.find((result) => result.status === "rejected");
    const open = frame.isCurrent();

    if (failure || !open) {
      // Subscriptions from earlier requests stay while the connection is open.
      // After a close, the router has no storage. Thus each accepted subscription must stop.
      const added = open
        ? loaded.filter((item) => !this.channels.isSubscribed(item.channel))
        : loaded;

      await Promise.allSettled(
        added.map(async (item) => {
          await this.senders.unsubscribe(item.sender, [item.channel]);
        }),
      );

      throw failure ? toAHPError(failure.reason) : new AHPError("Connection is closed");
    }

    return loaded.map(({ channel, sender, revision, state }) => ({
      resource: channel,
      state,
      fromSeq: this.channels.subscribe({ channel, sender, revision }),
    }));
  }

  /** Removes a subscription here, then at its sender. */
  private async unsubscribe(channel: string): Promise<void> {
    const sender = this.channels.unsubscribe(channel);

    if (sender !== undefined) {
      await this.senders.unsubscribe(sender, [channel]);
    }
  }

  private async disposeSession(channel: string): Promise<void> {
    const parsed = parseChannel(channel);

    if (parsed.kind !== "session") {
      throw new AHPError("Expected an ahp-session channel");
    }

    await this.options.host().disposeSession({ sessionId: parsed.sessionId });
  }

  /**
   * Sends a client action to the session that owns the chat channel.
   * Only the client that sent the action receives a rejection.
   * Subscribers receive an accepted action as a push from the session.
   */
  private async dispatchAction(
    socket: WebSocket,
    params: JsonRpcCall["params"],
    frame: FrameScope,
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
      await this.options
        .session(parsed.sessionId)
        .dispatch({ channel: submitted.channel, action, origin });
    } catch (error) {
      // A closed connection has no storage for the `serverSeq` of the rejection.
      if (!frame.isCurrent()) {
        return;
      }

      send(socket, {
        jsonrpc: "2.0",
        method: "action",
        params: {
          channel: submitted.channel,
          action: submitted.action,
          origin,
          serverSeq: this.channels.allocate(1),
          rejectionReason: errorMessage(error),
        },
      });
    }
  }

  private requireClientId(socket: WebSocket): string {
    const clientId = this.clientId(socket);

    if (clientId === undefined) {
      throw new AHPError("Initialize the connection first", AHPJsonRpcErrorCodes.InvalidRequest);
    }

    return clientId;
  }
}
