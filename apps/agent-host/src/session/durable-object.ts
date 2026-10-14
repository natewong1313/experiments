import { DurableObject } from "cloudflare:workers";
import type { Stream } from "@agentclientprotocol/sdk";
import { errorMessage } from "../protocol";
import {
  SessionCreateError,
  SessionDispatchError,
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
  protected readonly db = new SessionDatabase(this.ctx.storage);
  private readonly session = new SessionService({
    db: this.db,
    workingDirectory: (): string => this.getWorkingDirectory(),
    hostNamespace: (): DurableObjectNamespace<HostRPC> => this.getHostNamespace(),
    connectAgent: (id): Promise<Stream> => this.connectAgent(id),
    schedule: (promise): void => {
      this.ctx.waitUntil(promise);
    },
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.db.migrate();
      await this.session.recover();
    });
  }

  protected abstract getHostNamespace(): DurableObjectNamespace<HostRPC>;
  protected abstract connectAgent(sessionId: string): Promise<Stream>;

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
    await this.session.dispose();
  }
}
