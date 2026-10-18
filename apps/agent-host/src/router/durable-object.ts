import { DurableObject } from "cloudflare:workers";
import type { JsonRpcMessage } from "@experiments/protocol-schemas/ahp";
import { ROOT_SENDER, hostIdFromRouterName, requireName, sessionDOName } from "../shared/lookups";
import { ROOT_CHANNEL } from "../shared/protocol";
import type {
  AgentHostConnectionRouterRPC,
  RootEvent,
  RouterPushResponse,
  RouterRootUpdateRequest,
  RouterSessionActionsRequest,
  RouterSessionDisposedRequest,
  SessionEnvelope,
} from "../shared/rpc/router";
import type { HostRPC } from "../shared/rpc/host";
import type { SessionRPC } from "../shared/rpc/session";
import type { StubFor } from "../shared/stubs";
import { RouterDatabase } from "./db/database";
import { RouterChannels } from "./service/channels";
import type { SenderRevision } from "./service/channels";
import { RouterConnection } from "./service/connection";
import { ClientRequests } from "./service/requests";
import { Senders } from "./service/senders";
import { CloseCode, send } from "./websockets";

/** A root event as an item of its root revision. */
type RootItem = { channel: string; event: RootEvent };

/** A root event that the router sends without a `serverSeq`. */
type RootNotification = Exclude<RootEvent, { kind: "action" }>;

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
    senders: this.senders,
    ...this.stubs,
  });

  private connection = new RouterConnection({
    channels: this.channels,
    senders: this.senders,
    handleFrame: async (socket, raw, frame): Promise<void> => {
      await this.requests.handleFrame(socket, raw, frame);
    },
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.connection.load();
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

    await this.connection.open();
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({});

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Handles JSON-RPC messages from the client. Ignores frames after a disconnect. */
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.connection.handleMessage(socket, message);
  }

  /** Completes the close handshake, then removes the subscriptions of the connection. */
  async webSocketClose(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.Normal, "Connection closed");
    await this.connection.close();
  }

  /** Closes the socket after a connection error, then removes its subscriptions. */
  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.InternalError, "Connection error");
    await this.connection.close();
  }

  async sessionActions(req: RouterSessionActionsRequest): Promise<RouterPushResponse> {
    const revisions = req.updates.map(({ revision, actions }) => ({ revision, items: actions }));

    return await this.receive(req.sessionId, req.after, revisions, (socket, envelopes) => {
      this.sendActions(socket, envelopes);
    });
  }

  async sessionDisposed(req: RouterSessionDisposedRequest): Promise<void> {
    if (await this.connection.admitPush(req.sessionId)) {
      this.channels.removeSender(req.sessionId);
    }
  }

  async rootUpdate(req: RouterRootUpdateRequest): Promise<RouterPushResponse> {
    const revisions = req.updates.map((update) => ({
      revision: update.revision,
      items: [{ channel: ROOT_CHANNEL, event: update }],
    }));

    return await this.receive(ROOT_SENDER, req.after, revisions, (socket, items) => {
      this.sendRootEvents(socket, items);
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
    if (!(await this.connection.admitPush(sender))) {
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
      await this.connection.close();
    }

    return socket;
  }

  /**
   * Closes the socket with code 1011 and removes the subscriptions of the connection. The
   * senders keep no history, so the client must initialize again to get a snapshot.
   */
  private async closeAfterGap(socket: WebSocket): Promise<void> {
    socket.close(CloseCode.InternalError, "Missed updates");
    await this.connection.close();
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

/** Encodes a root event without a `serverSeq` as a JSON-RPC notification. */
function rootNotification(channel: string, event: RootNotification): JsonRpcMessage {
  switch (event.kind) {
    case "sessionAdded": {
      return {
        jsonrpc: "2.0",
        method: "root/sessionAdded",
        params: { channel, summary: event.summary },
      };
    }

    case "sessionRemoved": {
      return {
        jsonrpc: "2.0",
        method: "root/sessionRemoved",
        params: { channel, session: event.session },
      };
    }

    case "sessionSummaryChanged": {
      const params = { channel, session: event.session, changes: event.changes };

      return { jsonrpc: "2.0", method: "root/sessionSummaryChanged", params };
    }
  }
}
