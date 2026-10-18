/* oxlint-disable import/max-dependencies -- The router owns the client connection, its requests, and the pushes from the senders. */
import { DurableObject } from "cloudflare:workers";
import * as z from "zod";
import {
  AhpErrorCodes as AHPErrorCodes,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
  PROTOCOL_VERSION as AHP_PROTOCOL_VERSION,
} from "@microsoft/agent-host-protocol";
import type {
  ChannelState as AHPChannelState,
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
import { callDoRpc } from "../shared/do-rpc";
import { errorMessage } from "../shared/errors";
import {
  ROOT_SENDER,
  channelSender,
  hostIdFromRouterName,
  parseChannel,
  requireName,
  sessionDOName,
} from "../shared/lookups";
import type { Channel } from "../shared/lookups";
import { AHPError, ROOT_CHANNEL } from "../shared/protocol";
import { toAHPError } from "../shared/rpc/errors";
import type { HostRPC } from "../shared/rpc/host";
import type {
  AgentHostConnectionRouterRPC,
  RootEvent,
  RouterPushResponse,
  RouterRootUpdateRequest,
  RouterSessionActionsRequest,
  RouterSessionDisposedRequest,
  SessionEnvelope,
} from "../shared/rpc/router";
import { SessionDispatchActionSchema } from "../shared/rpc/session";
import type { SessionRPC } from "../shared/rpc/session";
import type { StubFor } from "../shared/stubs";
import { RouterDatabase } from "./db/database";
import { RouterChannels } from "./router-channels";
import type { SenderRevision } from "./router-channels";
import { SenderGate } from "./sender-gate";
import { CloseCode, rootNotification, send, sendError } from "./websockets";

const AttachmentSchema = z.object({ clientId: z.string().optional() }).nullable();

/**
 * The lifecycle of the client connection. Each open connection is a new object. A frame
 * compares its object with the current state to find out if its connection is still open.
 */
type ConnectionState =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "closing"; closed: Promise<void> };

type OpenConnection = Extract<ConnectionState, { kind: "open" }>;

/**
 * One client frame. `connection` is the connection that the frame started under. `done`
 * resolves after the frame sends its reply.
 */
type Frame = { connection: OpenConnection; done: Promise<null> };

/** The snapshot of a channel from its sender. */
type SenderSnapshot = {
  channel: string;
  sender: string;
  revision: number;
  state: AHPChannelState;
};

/** A root event as an item of its root revision. */
type RootItem = { channel: string; event: RootEvent };

/** Sends the accepted items of a push to the client. */
type Deliver<Item> = (socket: WebSocket, items: Item[]) => void;

type RequestResult = AHPInitializeResult | AHPListSessionsResult | AHPSubscribeResult | null;

/**
 * Owns one client WebSocket. The Worker creates one router for each connection.
 *
 * The router answers `initialize` and `ping`, sends catalogue requests to the host, and sends
 * session requests directly to the sessions. The host and the sessions push updates to the
 * router. The router adds the `serverSeq` of the connection and forwards the updates to the
 * client.
 *
 * The router admits client frames one at a time and holds pushes behind subscribing frames.
 * `closeConnection` ends the connection before it awaits anything. Work that started under the
 * closed connection sees `isCurrent` return false and must not write router storage.
 */
export abstract class AgentHostConnectionRouter<
  Env = unknown,
  Host extends HostRPC = HostRPC,
  Session extends SessionRPC = SessionRPC,
>
  extends DurableObject<Env>
  implements AgentHostConnectionRouterRPC
{
  private db = new RouterDatabase(this.ctx.storage);
  private channels = new RouterChannels(this.db);
  private gate = new SenderGate();
  private connection: ConnectionState = { kind: "closed" };
  // The last frame that the socket sent. Each frame waits for the frame before it.
  private lastFrame: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.restoreAfterRestart();
    });
  }

  /** The host Durable Object namespace. The router sends catalogue requests to the host. */
  abstract host: DurableObjectNamespace<Host>;

  /** The session Durable Object namespace. The router sends session requests to a session. */
  abstract session: DurableObjectNamespace<Session>;

  async fetch(request: Request): Promise<Response> {
    // The router derives the host and session names from its own name.
    // This call throws before the upgrade if the name does not start with a host UUID.
    this.hostId();

    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    if (this.ctx.getWebSockets().length > 0) {
      return new Response("Router already has a connection", { status: 409 });
    }

    await this.openConnection();
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({});

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Runs a client frame after all earlier frames. Ignores frames after a disconnect.
   */
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const { connection } = this;

    if (connection.kind !== "open") {
      return;
    }

    const frame = this.runFrame(connection, this.lastFrame, socket, message);
    this.lastFrame = frame;
    await frame;
  }

  /** Completes the close handshake, then removes the subscriptions of the connection. */
  async webSocketClose(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.Normal, "Connection closed");
    await this.closeConnection();
  }

  /** Closes the socket after a connection error, then removes its subscriptions. */
  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.InternalError, "Connection error");
    await this.closeConnection();
  }

  async sessionActions(req: RouterSessionActionsRequest): Promise<RouterPushResponse> {
    const revisions = req.updates.map(({ revision, actions }) => ({ revision, items: actions }));

    return await this.receivePush(req.sessionId, req.after, revisions, (socket, envelopes) => {
      this.sendActions(socket, envelopes);
    });
  }

  async sessionDisposed(req: RouterSessionDisposedRequest): Promise<void> {
    if (await this.admitPush(req.sessionId)) {
      this.channels.removeSender(req.sessionId);
    }
  }

  async rootUpdate(req: RouterRootUpdateRequest): Promise<RouterPushResponse> {
    const revisions = req.updates.map((update) => ({
      revision: update.revision,
      items: [{ channel: ROOT_CHANNEL, event: update }],
    }));

    return await this.receivePush(ROOT_SENDER, req.after, revisions, (socket, items) => {
      this.sendRootEvents(socket, items);
    });
  }

  /** Resumes the connection after a restart if the router has storage. */
  private async restoreAfterRestart(): Promise<void> {
    if (this.db.hasMigrated()) {
      await this.db.migrate();
      this.connection = { kind: "open" };
    }
  }

  /** Creates the storage for a new connection after the cleanup of an earlier connection. */
  private async openConnection(): Promise<void> {
    if (this.connection.kind === "closing") {
      await this.connection.closed;
    }

    await this.db.migrate();
    this.connection = { kind: "open" };
  }

  /**
   * Ends the connection, deletes the router storage, and tells each sender to stop its pushes.
   * The unsubscribe calls are best effort. A sender also stops after a push to this router
   * reports no subscriptions.
   */
  private async closeConnection(): Promise<void> {
    if (this.connection.kind !== "open") {
      return;
    }

    const senders = this.channels.senders();

    const closed = (async (): Promise<void> => {
      await this.channels.clear();

      await Promise.allSettled(
        [...senders].map(async ([sender, channels]) => {
          await this.unsubscribeAtSender(sender, channels);
        }),
      );
    })();

    this.connection = { kind: "closing", closed };

    try {
      await closed;
    } finally {
      this.connection = { kind: "closed" };
    }
  }

  /** Resolves when pushes from the sender may continue. Returns false if the connection closed. */
  private async admitPush(sender: string): Promise<boolean> {
    await this.gate.settled(sender);

    return this.connection.kind === "open";
  }

  /** Returns false after the connection of the frame closes. */
  private isCurrent(frame: Frame): boolean {
    return this.connection === frame.connection;
  }

  /**
   * Waits for the frame before it, then handles the frame if its connection is still open.
   * Pushes that the frame holds continue after the frame ends.
   */
  private async runFrame(
    connection: OpenConnection,
    previous: Promise<void>,
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    await Promise.allSettled([previous]);

    if (this.connection !== connection) {
      return;
    }

    const { promise: done, resolve } = Promise.withResolvers<null>();

    try {
      await this.handleFrame(socket, raw, { connection, done });
    } finally {
      resolve(null);
    }
  }

  /** Sends a reply with a null ID if the frame is not a valid JSON-RPC message. */
  private async handleFrame(
    socket: WebSocket,
    raw: string | ArrayBuffer,
    frame: Frame,
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
          await this.unsubscribeChannel(AHPChannelParamsSchema.parse(params).channel);
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
        const [snapshot] = await this.subscribeChannels([channel], frame);

        return { snapshot };
      }

      case "listSessions": {
        AHPListSessionsParamsSchema.parse(params);

        return await this.hostStub().listSessions();
      }

      case "createSession": {
        await this.hostStub().createSession(AHPCreateSessionParamsSchema.parse(params));

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
    const snapshots = await this.subscribeChannels(channels, frame);
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
  private async subscribeChannels(channels: string[], frame: Frame): Promise<AHPSnapshot[]> {
    const items = channels.map((channel) => ({ channel, parsed: parseChannel(channel) }));

    for (const item of items) {
      this.gate.hold(channelSender(item.parsed), frame.done);
    }

    const results = await Promise.allSettled(
      items.map(async (item) => await this.subscribeAtSender(item.channel, item.parsed)),
    );

    const loaded = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const failure = results.find((result) => result.status === "rejected");
    const open = this.isCurrent(frame);

    if (failure || !open) {
      // Subscriptions from earlier requests stay while the connection is open.
      // After a close, the router has no storage. Thus each accepted subscription must stop.
      const added = open
        ? loaded.filter((item) => !this.channels.isSubscribed(item.channel))
        : loaded;

      await Promise.allSettled(
        added.map(async (item) => {
          await this.unsubscribeAtSender(item.sender, [item.channel]);
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
  private async unsubscribeChannel(channel: string): Promise<void> {
    const sender = this.channels.unsubscribe(channel);

    if (sender !== undefined) {
      await this.unsubscribeAtSender(sender, [channel]);
    }
  }

  private async disposeSession(channel: string): Promise<void> {
    const parsed = parseChannel(channel);

    if (parsed.kind !== "session") {
      throw new AHPError("Expected an ahp-session channel");
    }

    await this.hostStub().disposeSession({ sessionId: parsed.sessionId });
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
      await this.sessionStub(parsed.sessionId).dispatch({
        channel: submitted.channel,
        action,
        origin,
      });
    } catch (error) {
      // A closed connection has no storage for the `serverSeq` of the rejection.
      if (!this.isCurrent(frame)) {
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
   * Subscribes this router at the sender of the channel and returns the snapshot. The host is
   * the sender of the root channel. A session is the sender of its session and chat channels.
   */
  private async subscribeAtSender(channel: string, parsed: Channel): Promise<SenderSnapshot> {
    const router = this.routerName();
    const sender = channelSender(parsed);

    if (parsed.kind === "root") {
      const root = await callDoRpc(
        () => this.hostStub(),
        (host) => host.subscribeRoot({ router }),
      );

      return { channel, sender, ...root };
    }

    const session = await callDoRpc(
      () => this.sessionStub(parsed.sessionId),
      (stub) => stub.subscribe({ router, channel }),
    );

    return { channel, sender, ...session };
  }

  /** Tells the sender to stop its pushes of `channels` to this router. */
  private async unsubscribeAtSender(sender: string, channels: string[]): Promise<void> {
    const router = this.routerName();

    await (sender === ROOT_SENDER
      ? callDoRpc(
          () => this.hostStub(),
          (host) => host.unsubscribeRoot({ router }),
        )
      : callDoRpc(
          () => this.sessionStub(sender),
          (session) => session.unsubscribe({ router, channels }),
        ));
  }

  /**
   * Applies a push from a sender and passes its new items to `deliver`. Returns the channels of
   * the sender that the client still subscribes to.
   */
  private async receivePush<Item extends { channel: string }>(
    sender: string,
    after: number,
    revisions: SenderRevision<Item>[],
    deliver: Deliver<Item>,
  ): Promise<RouterPushResponse> {
    if (!(await this.admitPush(sender))) {
      return { subscribed: [] };
    }

    const socket = await this.connectedSocket();

    if (!socket) {
      return { subscribed: [] };
    }

    const receipt = this.channels.receive(sender, after, revisions);

    switch (receipt.kind) {
      case "unknown": {
        return { subscribed: [] };
      }

      case "gap": {
        await this.closeAfterGap(socket);

        return { subscribed: [] };
      }

      case "accepted": {
        deliver(socket, receipt.items);

        return { subscribed: receipt.subscribed };
      }
    }
  }

  /** Sends root actions with consecutive `serverSeq` values, and root notifications without. */
  private sendRootEvents(socket: WebSocket, items: RootItem[]): void {
    const actions = items.filter((item) => item.event.kind === "action").length;
    let serverSeq = this.channels.allocate(actions);

    for (const { channel, event } of items) {
      if (event.kind === "action") {
        send(socket, {
          jsonrpc: "2.0",
          method: "action",
          params: { channel, action: event.action, serverSeq },
        });
        serverSeq += 1;
      } else {
        send(socket, rootNotification(channel, event));
      }
    }
  }

  /** Sends session and chat actions with consecutive `serverSeq` values. */
  private sendActions(socket: WebSocket, envelopes: SessionEnvelope[]): void {
    const firstSeq = this.channels.allocate(envelopes.length);

    for (const [index, envelope] of envelopes.entries()) {
      const params = { ...envelope, serverSeq: firstSeq + index };
      send(socket, { jsonrpc: "2.0", method: "action", params });
    }
  }

  /**
   * Returns the socket of the connection. A connection without a socket closes and returns
   * undefined.
   */
  private async connectedSocket(): Promise<WebSocket | undefined> {
    const [socket] = this.ctx.getWebSockets();

    if (!socket) {
      await this.closeConnection();
    }

    return socket;
  }

  /**
   * Closes the socket with code 1011 and removes the subscriptions of the connection. The
   * senders keep no history, so the client must initialize again to get a snapshot.
   */
  private async closeAfterGap(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.InternalError, "Missed updates");
    await this.closeConnection();
  }

  private hostStub(): StubFor<"host"> {
    return this.host.getByName(this.hostId());
  }

  private sessionStub(sessionId: string): StubFor<"session"> {
    const name = sessionDOName(this.hostId(), sessionId);

    return this.session.getByName(name);
  }

  /** Returns the host ID from the router name. */
  private hostId(): string {
    return hostIdFromRouterName(this.routerName());
  }

  private routerName(): string {
    return requireName(this.ctx, "AgentHostConnectionRouter");
  }
}
