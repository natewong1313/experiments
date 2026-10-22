import { DurableObject, waitUntil } from "cloudflare:workers";
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
import { DEFAULT_ROUTER_CONFIG } from "./dependencies/router-durability";
import type { RouterDurability, RouterConfig } from "./dependencies/router-durability";
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
  private subscriptions: Subscriptions;
  private clientRequests: ClientRequestsRouter;
  private senderRequests: SenderRequestsRouter;
  // True while `alarm` runs the due durable work. `alarm` cleans up after that work.
  private alarmRunning = false;
  // The cleanup that runs now. Callers wait for it instead of starting another one.
  private cleaning?: Promise<void>;

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

    const deps = createRouterDeps(ctx, routerName, stubs, {
      config: this.config,
      onWakeUp: () => {
        this.onWakeUp();
      },
    });

    this.db = deps.db;
    this.durability = deps.durability;

    const subscriptions = new Subscriptions(deps);
    this.subscriptions = subscriptions;
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

  /**
   * The timing of the durable calls. The router reads it once, when it opens its storage. A
   * subclass overrides this to replace the defaults.
   */
  protected get config(): RouterConfig {
    return DEFAULT_ROUTER_CONFIG;
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
   * Runs any due durable work, then cleans up storage.
   */
  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    this.alarmRunning = true;

    try {
      await this.durability.mountAlarm(info);
    } finally {
      this.alarmRunning = false;
    }

    await this.cleanUp();
  }

  /**
   * Runs the cleanup after a wake-up that ran from the in-memory timer of the scheduler. Such
   * a wake-up does not call `alarm`. The cleanup deletes storage only when the physical alarm
   * is not set. The scheduler deletes it after it records the run, so the deletion cannot
   * remove the tables before that record.
   */
  private onWakeUp(): void {
    if (!this.alarmRunning) {
      waitUntil(this.cleanUp());
    }
  }

  /**
   * Deletes the storage of the router after its close finishes. The close unsubscribes at
   * senders through a durable call. A subscription that started before the close can still
   * register a durable call. This schedules a wake-up while a call or a subscription is pending.
   */
  private async cleanUp(): Promise<void> {
    this.cleaning ??= this.cleanUpOnce();
    await this.cleaning;
  }

  /** Runs one cleanup, then lets the next caller start a new one. */
  private async cleanUpOnce(): Promise<void> {
    try {
      await this.runCleanUp();
    } finally {
      this.cleaning = undefined;
    }
  }

  private async runCleanUp(): Promise<void> {
    if (!(await this.durability.closeStarted())) {
      return;
    }

    if (this.subscriptions.isSubscribing() || (await this.durability.hasPendingWork())) {
      await this.durability.scheduleWakeUp();

      return;
    }

    // Also deletes the tables of the scheduler and the alarm.
    await this.db.deleteAll();
    this.durability.reset();
  }
}
