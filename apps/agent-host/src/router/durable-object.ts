import { DurableObject } from "cloudflare:workers";
import { hostIdFromRouterName, requireName, sessionDOName } from "../shared/lookups";
import type { HostRPC } from "../shared/rpc/host";
import type {
  AgentHostConnectionRouterRPC,
  RouterPushResponse,
  RouterRootUpdateRequest,
  RouterSessionActionsRequest,
  RouterSessionDisposedRequest,
} from "../shared/rpc/router";
import type { SessionRPC } from "../shared/rpc/session";
import { RouterDatabase } from "./db/database";
import type { AgentHostConnectionRouterDeps, Stubs } from "./dependencies";
import { RemoteSubscriptions } from "./dependencies/remote-subscriptions";
import { ServerSequence } from "./dependencies/server-sequence";
import { SubscriptionStore } from "./dependencies/subscription-store";
import { ClientConnection } from "./services/client-connection";
import { ClientRequestsRouter } from "./services/client-requests";
import { SenderRequestsRouter } from "./services/sender-requests";
import { Subscriptions } from "./services/subscriptions";
import { CloseCode } from "./websockets";

/**
 * Owns one client WebSocket. The Worker creates one router for each connection.
 *
 * `ClientConnection` owns the connection lifecycle and the frame order. `ClientRequestsRouter`
 * handles the client frames and `SenderRequestsRouter` handles the updates that the host and
 * the sessions push. `Subscriptions` holds pushes during subscription setup, so the client
 * receives each snapshot before the updates that follow it.
 */
export abstract class AgentHostConnectionRouter<
  Env = unknown,
  Host extends HostRPC = HostRPC,
  Session extends SessionRPC = SessionRPC,
>
  extends DurableObject<Env>
  implements AgentHostConnectionRouterRPC
{
  // TODO: durability alarms?
  private connection: ClientConnection;
  private clientRequests: ClientRequestsRouter;
  private senderRequests: SenderRequestsRouter;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // The router derives the host and session names from its own name.
    const routerName = requireName(ctx, "AgentHostConnectionRouter");
    const hostId = hostIdFromRouterName(routerName);

    const stubs: Stubs = {
      host: () => this.host.getByName(hostId),
      session: (sessionId) => this.session.getByName(sessionDOName(hostId, sessionId)),
    };

    const db = new RouterDatabase(ctx.storage);

    const deps = {
      ctx,
      db,
      stubs,
      sequence: new ServerSequence(db),
      remoteSubscriptions: new RemoteSubscriptions(routerName, stubs),
      subscriptionStore: new SubscriptionStore(db),
    } satisfies AgentHostConnectionRouterDeps;

    const subscriptions = new Subscriptions(deps);
    this.connection = new ClientConnection(deps, subscriptions);
    this.clientRequests = new ClientRequestsRouter(deps, subscriptions);
    this.senderRequests = new SenderRequestsRouter(deps, this.connection, subscriptions);

    void ctx.blockConcurrencyWhile(async () => {
      await this.connection.restore();
    });
  }

  /** The host Durable Object namespace. The router sends catalogue requests to the host. */
  abstract host: DurableObjectNamespace<Host>;

  /** The session Durable Object namespace. The router sends session requests to a session. */
  abstract session: DurableObjectNamespace<Session>;

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    if (this.connection.hasSocket()) {
      return new Response("Router already has a connection", { status: 409 });
    }

    const client = await this.connection.open();

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Runs a client frame after all earlier frames. */
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.connection.receiveFrame(socket, async (frame) => {
      await this.clientRequests.handleFrame(socket, message, frame);
    });
  }

  /** Completes the close handshake, then removes the subscriptions of the connection. */
  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.connection.closeSocket(socket, CloseCode.Normal, "Connection closed");
  }

  /** Closes the socket after a connection error, then removes its subscriptions. */
  async webSocketError(socket: WebSocket): Promise<void> {
    await this.connection.closeSocket(socket, CloseCode.InternalError, "Connection error");
  }

  /** Forwards session and chat actions to the client. */
  async sessionActions(req: RouterSessionActionsRequest): Promise<RouterPushResponse> {
    return await this.senderRequests.sessionActions(req);
  }

  /** Forwards root actions and root notifications to the client. */
  async rootUpdate(req: RouterRootUpdateRequest): Promise<RouterPushResponse> {
    return await this.senderRequests.rootUpdate(req);
  }

  /** Removes the subscriptions of a disposed session without a message to the client. */
  async sessionDisposed(req: RouterSessionDisposedRequest): Promise<void> {
    await this.senderRequests.sessionDisposed(req);
  }
}
