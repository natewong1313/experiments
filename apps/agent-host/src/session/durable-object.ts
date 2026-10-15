import { DurableObject } from "cloudflare:workers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";
import { errorMessage } from "../shared/errors";
import {
  SessionCreateError,
  SessionDispatchError,
  SessionDisposeError,
  SessionSnapshotError,
} from "../shared/rpc/session";
import type {
  SessionRPC,
  SessionCreateRequest,
  SessionDispatchRequest,
  SessionSnapshotRequest,
  SessionSnapshotResponse,
} from "../shared/rpc/session";
import type { HostRPC } from "../shared/rpc/host";
import { SessionDatabase } from "./db/database";
import { SessionService } from "./service/session";

export abstract class AgentSession<Env = unknown> extends DurableObject<Env> implements SessionRPC {
  protected db = new SessionDatabase(this.ctx.storage);
  private session = new SessionService({
    db: this.db,
    workingDirectory: (): string => this.getWorkingDirectory(),
    hostNamespace: (): DurableObjectNamespace<HostRPC> => this.getHostNamespace(),
    connectAgent: (id): Promise<ACPStream> => this.connectAgent(id),
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.db.migrate();
      await this.session.load();
    });
  }

  protected abstract getHostNamespace(): DurableObjectNamespace<HostRPC>;
  protected abstract connectAgent(sessionId: string): Promise<ACPStream>;

  protected getWorkingDirectory(): string {
    return "/";
  }

  async create(req: SessionCreateRequest): Promise<void> {
    try {
      await this.session.create(req);
    } catch (error) {
      throw new SessionCreateError(errorMessage(error));
    }
  }

  async snapshot(req: SessionSnapshotRequest): Promise<SessionSnapshotResponse> {
    try {
      return await this.session.snapshot(req);
    } catch (error) {
      throw new SessionSnapshotError(errorMessage(error));
    }
  }

  async dispatch(req: SessionDispatchRequest): Promise<void> {
    try {
      await this.session.dispatch(req);
    } catch (error) {
      throw new SessionDispatchError(errorMessage(error));
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.session.dispose();
    } catch (error) {
      throw new SessionDisposeError(errorMessage(error));
    }
  }
}
