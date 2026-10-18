import { DurableObject } from "cloudflare:workers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";
import {
  SessionCreateError,
  SessionDispatchError,
  SessionDisposeError,
  SessionSubscribeError,
} from "../shared/rpc/session";
import type {
  SessionRPC,
  SessionCreateRequest,
  SessionDispatchRequest,
  SessionSubscribeRequest,
  SessionSubscribeResponse,
  SessionUnsubscribeRequest,
} from "../shared/rpc/session";
import type { HostRPC } from "../shared/rpc/host";
import type { AgentHostConnectionRouterRPC } from "../shared/rpc/router";
import type { StubFor } from "../shared/stubs";
import { requireName, sessionIdFromDOName } from "../shared/lookups";
import { SessionDatabase } from "./db/database";
import { SessionService } from "./service/session";
import { SessionStore } from "./service/store";

/**
 * Owns one session: its persisted state, its ACP connection, and the routers that subscribe
 * to it. The session pushes its updates directly to those routers.
 */
export abstract class AgentSession<
  Env = unknown,
  Router extends AgentHostConnectionRouterRPC = AgentHostConnectionRouterRPC,
  Host extends HostRPC = HostRPC,
>
  extends DurableObject<Env>
  implements SessionRPC
{
  /** The router Durable Object namespace. The session pushes its updates to the routers. */
  abstract router: DurableObjectNamespace<Router>;

  /** The host Durable Object namespace. The session syncs its summary to the host. */
  abstract host: DurableObjectNamespace<Host>;

  protected db = new SessionDatabase(this.ctx.storage);

  private store = new SessionStore({
    ctx: this.ctx,
    db: this.db,
    sessionId: (): string => sessionIdFromDOName(this.sessionName()),
    host: (name): StubFor<"host"> => this.host.getByName(name),
    router: (name): StubFor<"router"> => this.router.getByName(name),
  });

  private session = new SessionService({
    store: this.store,
    workingDirectory: (): string => this.getWorkingDirectory(),
    connectAgent: (id): Promise<ACPStream> => this.connectAgent(id),
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.session.load();
    });
  }

  protected abstract connectAgent(sessionId: string): Promise<ACPStream>;

  protected getWorkingDirectory(): string {
    return "/";
  }

  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.store.alarm(info);
  }

  async create(req: SessionCreateRequest): Promise<void> {
    try {
      await this.session.create(req);
    } catch (error) {
      throw new SessionCreateError(error);
    }
  }

  async subscribe(req: SessionSubscribeRequest): Promise<SessionSubscribeResponse> {
    try {
      return this.store.subscribe(req);
    } catch (error) {
      throw new SessionSubscribeError(error);
    }
  }

  async unsubscribe(req: SessionUnsubscribeRequest): Promise<void> {
    this.store.unsubscribe(req);
  }

  async dispatch(req: SessionDispatchRequest): Promise<void> {
    try {
      await this.session.dispatch(req);
    } catch (error) {
      throw new SessionDispatchError(error);
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.session.dispose();
    } catch (error) {
      throw new SessionDisposeError(error);
    }
  }

  private sessionName(): string {
    return requireName(this.ctx, "AgentSession");
  }
}
