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
import type { SenderGate } from "./gate";
import type { Senders } from "./senders";

const AttachmentSchema = z.object({ clientId: z.string().optional() }).nullable();

type ClientRequestsOptions = {
  channels: RouterChannels;
  gate: SenderGate;
  senders: Senders;
  host(): StubFor<"host">;
  session(sessionId: string): StubFor<"session">;
};

/**
 * Contains the promise of a frame. `handleMessage` sets it after `runFrame` returns the promise.
 * Thus the frame can pass its own promise to the gate.
 */
type FrameSlot = { done?: Promise<void> };

type RequestResult = AHPInitializeResult | AHPListSessionsResult | AHPSubscribeResult | null;

/**
 * Handles the JSON-RPC messages of one client connection.
 * The router answers `initialize` and `ping`. It sends catalogue requests and root
 * subscriptions to the host, and sends session and chat requests to the session.
 */
export class ClientRequests {
  private options: ClientRequestsOptions;
  private channels: RouterChannels;
  private gate: SenderGate;
  private senders: Senders;
  // The last frame that the socket sent. Each frame waits for the frame before it.
  private frames: Promise<void> = Promise.resolve();
  // The frame that runs now. It settles after the router sends the reply to the frame.
  private current: Promise<void> = Promise.resolve();

  constructor(options: ClientRequestsOptions) {
    this.options = options;
    this.channels = options.channels;
    this.gate = options.gate;
    this.senders = options.senders;
  }

  /** Returns the client ID set by `initialize`, or undefined before initialization. */
  private clientId(socket: WebSocket): string | undefined {
    return AttachmentSchema.parse(socket.deserializeAttachment())?.clientId;
  }

  /** Handles one WebSocket frame after all earlier frames from the same socket. */
  async handleMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const slot: FrameSlot = {};
    const done = this.runFrame(this.frames, slot, socket, raw);
    slot.done = done;
    this.frames = done;
    await done;
  }

  /**
   * Runs a frame after the frame before it. Later frames can replace `frames` while this frame
   * waits. Thus the frame reads its own promise from `slot` when it starts.
   */
  private async runFrame(
    previous: Promise<void>,
    slot: FrameSlot,
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    await Promise.allSettled([previous]);
    this.current = slot.done ?? Promise.resolve();
    await this.handleFrame(socket, raw);
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
            const [snapshot] = await this.subscribe([
              AHPSubscribeParamsSchema.parse(params).channel,
            ]);

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
  ): Promise<AHPInitializeResult> {
    if (this.clientId(socket) !== undefined) {
      throw new AHPError("Connection is already initialized");
    }

    if (!params.protocolVersions.includes(AHP_PROTOCOL_VERSION)) {
      throw new AHPError("Unsupported protocol version", AHPErrorCodes.UnsupportedProtocolVersion, {
        supportedVersions: [AHP_PROTOCOL_VERSION],
      });
    }

    const snapshots = await this.subscribe([...new Set(params.initialSubscriptions)]);
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
   */
  private async subscribe(channels: string[]): Promise<AHPSnapshot[]> {
    const items = channels.map((channel) => ({ channel, parsed: parseChannel(channel) }));
    this.gate.hold(
      items.map((item) => channelSender(item.parsed)),
      this.current,
    );

    const results = await Promise.allSettled(
      items.map(async (item) => await this.senders.subscribe(item)),
    );

    const loaded = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const failure = results.find((result) => result.status === "rejected");

    if (failure) {
      // The client receives an error.
      // Thus each sender that accepted a new subscription must stop its pushes.
      // Subscriptions from earlier requests stay.
      const added = loaded.filter((item) => !this.channels.isSubscribed(item.channel));

      await Promise.allSettled(
        added.map(async (item) => {
          await this.senders.unsubscribe(item.sender, [item.channel]);
        }),
      );

      throw toAHPError(failure.reason);
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
  private async dispatchAction(socket: WebSocket, params: JsonRpcCall["params"]): Promise<void> {
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
