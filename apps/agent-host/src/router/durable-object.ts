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
import type { RouterDatabase } from "./db/database";
import { createRouterDeps } from "./dependencies";
import type { Stubs } from "./dependencies";
import { DEFAULT_ROUTER_DURABILITY_POLICY } from "./dependencies/router-durability";
import type { RouterDurability, RouterDurabilityPolicy } from "./dependencies/router-durability";
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
 * the sessions push. `Subscriptions` holds pushes during subscription setup. Each snapshot
 * reaches the client before its updates.
 *
 * After a close, a durable call tells the senders to stop their pushes. The alarm of the router
 * deletes the router storage after that call settles. A router does not accept a second
 * connection, because the Worker gives each connection a new router name.
 */
export abstract class AgentHostConnectionRouter<
  Env = unknown,
  Host extends HostRPC = HostRPC,
  Session extends SessionRPC = SessionRPC,
>
  extends DurableObject<Env>
  implements AgentHostConnectionRouterRPC
{
  private db: RouterDatabase;
  private durability: RouterDurability;
  private connection: ClientConnection;
  private clientRequests: ClientRequestsRouter;
  private senderRequests: SenderRequestsRouter;

  /**
   * On wake, we resume the connection and migrate storage plus see if we were in the
   * middle of cleaning up the DO and if so, clean it up.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // The router derives the host and session names from its own name.
    const routerName = requireName(ctx, "AgentHostConnectionRouter");
    const hostId = hostIdFromRouterName(routerName);

    const stubs: Stubs = {
      host: () => this.host.getByName(hostId),
      session: (sessionId) => this.session.getByName(sessionDOName(hostId, sessionId)),
    };

    const deps = createRouterDeps(ctx, routerName, stubs, () => this.getDurabilityPolicy());
    this.db = deps.db;
    this.durability = deps.durability;

    const subscriptions = new Subscriptions(deps);
    this.connection = new ClientConnection(deps, subscriptions);
    this.clientRequests = new ClientRequestsRouter(deps, subscriptions);
    this.senderRequests = new SenderRequestsRouter(deps, this.connection, subscriptions);

    void ctx.blockConcurrencyWhile(async () => {
      await this.connection.restore();
      // A restart can interrupt a close before it schedules the wake-up.
      await this.cleanUp();
    });
  }

  /** The host Durable Object namespace. The router sends catalogue requests to the host. */
  abstract host: DurableObjectNamespace<Host>;

  /** The session Durable Object namespace. The router sends session requests to a session. */
  abstract session: DurableObjectNamespace<Session>;

  /** Returns the timing of the durable calls. The router reads it when it opens its storage. */
  protected getDurabilityPolicy(): RouterDurabilityPolicy {
    return DEFAULT_ROUTER_DURABILITY_POLICY;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    if (!this.connection.canOpen()) {
      return new Response("Router accepts only one connection", { status: 409 });
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

  /**
   * We run any due durable work, then cleans up storage.
   */
  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.durability.mountAlarm(info);
    await this.cleanUp();
  }

  /**
   * Cleaning up the DO runs as a durable job via our durability dep. We only delete the DOs storage
   * once that job has completed. This checks if the job is pending, which would mean we schedule a future
   * wake up.
   *
   * We only delete the DOs storage once that job is done.
   */
  private async cleanUp(): Promise<void> {
    if (!(await this.durability.closeStarted())) {
      return;
    }

    if (await this.durability.hasPendingWork()) {
      await this.durability.scheduleWakeUp();

      return;
    }

    // Also deletes the tables of the scheduler and the alarm.
    await this.db.deleteAll();
    this.durability.reset();
  }
}
