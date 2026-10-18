import { DurableObject } from "cloudflare:workers";
import type {
  JsonRpcMessage,
  RootAction as AHPRootAction,
} from "@experiments/protocol-schemas/ahp";
import { ROOT_SENDER, hostIdFromRouterName, requireName, sessionDOName } from "../shared/lookups";
import { ROOT_CHANNEL } from "../shared/protocol";
import type {
  AgentHostConnectionRouterRPC,
  RouterPushResponse,
  RouterRootActionsRequest,
  RouterSessionActionsRequest,
  RouterSessionAddedRequest,
  RouterSessionDisposedRequest,
  RouterSessionRemovedRequest,
  RouterSessionSummaryChangedRequest,
  SessionEnvelope,
} from "../shared/rpc/router";
import type { HostRPC } from "../shared/rpc/host";
import type { SessionRPC } from "../shared/rpc/session";
import type { StubFor } from "../shared/stubs";
import { RouterDatabase } from "./db/database";
import { RouterChannels } from "./service/channels";
import type { SenderRevision } from "./service/channels";
import { SenderGate } from "./service/gate";
import { ClientRequests } from "./service/requests";
import { Senders } from "./service/senders";
import { CloseCode, send } from "./websockets";

/** An item of a root revision. It is a root action or a notification without a `serverSeq`. */
type RootItem =
  | { channel: string; action: AHPRootAction }
  | { channel: string; message: JsonRpcMessage };

/** Sends the accepted items of a push to the client. */
type Deliver<Item> = (socket: WebSocket, items: Item[]) => void;

/**
 * Owns one client WebSocket. The Worker creates one router for each connection.
 *
 * The router answers `initialize` and `ping`, sends catalogue requests to the host, and sends
 * session requests directly to the sessions. The host and the sessions push updates to the
 * router. The router adds the `serverSeq` of the connection and forwards the updates to the
 * client.
 */
export abstract class AgentHostConnectionRouter<
  Env = unknown,
  Host extends HostRPC = HostRPC,
  Session extends SessionRPC = SessionRPC,
>
  extends DurableObject<Env>
  implements AgentHostConnectionRouterRPC
{
  /** The host Durable Object namespace. The router sends catalogue requests to the host. */
  abstract host: DurableObjectNamespace<Host>;

  /** The session Durable Object namespace. The router sends session requests to a session. */
  abstract session: DurableObjectNamespace<Session>;

  private db = new RouterDatabase(this.ctx.storage);
  private channels = new RouterChannels(this.db);
  private gate = new SenderGate();

  /** Builds the stubs that the senders and the client requests use for the host and the sessions. */
  private stubs = {
    host: (): StubFor<"host"> => this.host.getByName(this.hostId()),
    session: (sessionId: string): StubFor<"session"> => this.sessionStub(sessionId),
  };

  private senders = new Senders({
    routerName: (): string => this.routerName(),
    ...this.stubs,
  });

  private requests = new ClientRequests({
    channels: this.channels,
    gate: this.gate,
    senders: this.senders,
    ...this.stubs,
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.channels.load();
    });
  }

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

    await this.channels.open();
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({});

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Handles JSON-RPC messages from the client. Ignores frames after a disconnect. */
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (this.channels.isOpen()) {
      await this.requests.handleMessage(socket, message);
    }
  }

  /** Completes the close handshake, then removes the subscriptions of the connection. */
  async webSocketClose(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.Normal, "Connection closed");
    await this.disconnect();
  }

  /** Closes the socket after a connection error, then removes its subscriptions. */
  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.InternalError, "Connection error");
    await this.disconnect();
  }

  async sessionActions(req: RouterSessionActionsRequest): Promise<RouterPushResponse> {
    const revisions = req.updates.map(({ revision, actions }) => ({ revision, items: actions }));

    return await this.receive(req.sessionId, req.after, revisions, (socket, envelopes) => {
      this.sendActions(socket, envelopes);
    });
  }

  async sessionDisposed(req: RouterSessionDisposedRequest): Promise<void> {
    await this.gate.settled(req.sessionId);

    if (this.channels.isOpen()) {
      this.channels.removeSender(req.sessionId);
    }
  }

  async rootActions(req: RouterRootActionsRequest): Promise<RouterPushResponse> {
    const items = req.actions.map((action) => ({ channel: ROOT_CHANNEL, action }));

    return await this.receiveRoot(req.after, { revision: req.revision, items });
  }

  async sessionAdded(req: RouterSessionAddedRequest): Promise<RouterPushResponse> {
    const params = { channel: ROOT_CHANNEL, summary: req.summary };
    const message: JsonRpcMessage = { jsonrpc: "2.0", method: "root/sessionAdded", params };

    return await this.receiveRoot(req.after, {
      revision: req.revision,
      items: [{ channel: ROOT_CHANNEL, message }],
    });
  }

  async sessionRemoved(req: RouterSessionRemovedRequest): Promise<RouterPushResponse> {
    const params = { channel: ROOT_CHANNEL, session: req.session };
    const message: JsonRpcMessage = { jsonrpc: "2.0", method: "root/sessionRemoved", params };

    return await this.receiveRoot(req.after, {
      revision: req.revision,
      items: [{ channel: ROOT_CHANNEL, message }],
    });
  }

  async sessionSummaryChanged(
    req: RouterSessionSummaryChangedRequest,
  ): Promise<RouterPushResponse> {
    const params = { channel: ROOT_CHANNEL, session: req.session, changes: req.changes };

    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      method: "root/sessionSummaryChanged",
      params,
    };

    return await this.receiveRoot(req.after, {
      revision: req.revision,
      items: [{ channel: ROOT_CHANNEL, message }],
    });
  }

  /** Applies one root revision. Root actions get a `serverSeq`; notifications do not. */
  private async receiveRoot(
    after: number,
    revision: SenderRevision<RootItem>,
  ): Promise<RouterPushResponse> {
    return await this.receive(ROOT_SENDER, after, [revision], (socket, items) => {
      const actions = items.flatMap((item) => ("action" in item ? [item] : []));
      let serverSeq = this.channels.allocate(actions.length);

      for (const item of items) {
        if ("action" in item) {
          const params = { channel: item.channel, action: item.action, serverSeq };
          send(socket, { jsonrpc: "2.0", method: "action", params });
          serverSeq += 1;
        } else {
          send(socket, item.message);
        }
      }
    });
  }

  /**
   * Applies a push from a sender and passes its new items to `deliver`. Returns the channels of
   * the sender that the client still subscribes to.
   */
  private async receive<Item extends { channel: string }>(
    sender: string,
    after: number,
    revisions: SenderRevision<Item>[],
    deliver: Deliver<Item>,
  ): Promise<RouterPushResponse> {
    await this.gate.settled(sender);
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

  /** Sends session and chat actions with consecutive `serverSeq` values. */
  private sendActions(socket: WebSocket, envelopes: SessionEnvelope[]): void {
    const firstSeq = this.channels.allocate(envelopes.length);

    for (const [index, envelope] of envelopes.entries()) {
      const params = { ...envelope, serverSeq: firstSeq + index };
      send(socket, { jsonrpc: "2.0", method: "action", params });
    }
  }

  /**
   * Returns the socket of an open connection. A router without a socket removes its
   * subscriptions and returns undefined.
   */
  private async connectedSocket(): Promise<WebSocket | undefined> {
    if (!this.channels.isOpen()) {
      return undefined;
    }

    const [socket] = this.ctx.getWebSockets();

    if (!socket) {
      await this.disconnect();
    }

    return socket;
  }

  /**
   * Closes the socket with code 1011 and removes the subscriptions of the connection. The
   * senders keep no history, so the client must initialize again to get a snapshot.
   */
  private async closeAfterGap(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.InternalError, "Missed updates");
    await this.disconnect();
  }

  /**
   * Deletes the router storage and tells each sender to stop its pushes. The unsubscribe calls
   * are best effort. A sender also stops after a push to this router reports no subscriptions.
   */
  private async disconnect(): Promise<void> {
    if (!this.channels.isOpen()) {
      return;
    }

    const senders = this.channels.senders();
    await this.channels.clear();

    await Promise.allSettled(
      [...senders].map(async ([sender, channels]) => {
        await this.senders.unsubscribe(sender, channels);
      }),
    );
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
