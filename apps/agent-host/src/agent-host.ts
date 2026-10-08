import type { Stream } from "@agentclientprotocol/sdk";
import { DurableObject } from "cloudflare:workers";
import { createHostState } from "./state";
import { AgentConnections } from "./agent/acp";
import { AhpClients } from "./ahp/clients";
import { AhpRpc } from "./ahp/rpc";
import { ActionDispatch } from "./ahp/dispatch";
import { SessionLifecycle } from "./sessions/lifecycle";
import { TurnExecution } from "./sessions/turns";
import {
  AgentConfigSchema,
  workingDirectory,
  type AgentConfig,
  type AcpConnectionOptions,
} from "./host-config";

export abstract class AgentHost<Env = unknown> extends DurableObject<Env> {
  private readonly clients: AhpClients;
  private readonly rpc: Promise<AhpRpc>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const state = createHostState(ctx.storage);
    const { queries, mutations } = state;
    this.clients = new AhpClients({ ctx });
    this.rpc = ctx.blockConcurrencyWhile(async () => {
      await state.migrate();

      // Let subclass fields initialize before invoking its configuration hook.
      const config = AgentConfigSchema.parse(this.getAgentConfig());
      const publication = mutations.configureAgent(config.agent);

      if (publication) {
        this.clients.broadcast(publication);
      }

      const agents = new AgentConnections({
        connect: (options): Promise<Stream> => this.connectAcp(options),
        updates: (identity, notification, rootSessionId): void => {
          turns.onAgentUpdate(identity, notification, rootSessionId);
        },
      });

      function waitUntil(work: Promise<void>): void {
        ctx.waitUntil(work);
      }

      const turns = new TurnExecution({
        queries,
        mutations,
        agents,
        clients: this.clients,
        waitUntil,
      });

      const sessions = new SessionLifecycle({
        queries,
        mutations,
        agents,
        clients: this.clients,
        hostId: ctx.id.toString(),
        config,
        waitUntil,
      });

      const dispatcher = new ActionDispatch({
        queries,
        mutations,
        clients: this.clients,
        turns,
      });

      const rpc = new AhpRpc({
        queries,
        mutations,
        clients: this.clients,
        sessions,
        dispatcher,
        defaultDirectory: workingDirectory(config.cwd),
      });

      for (const record of queries.recoverableSessions()) {
        turns.recover(record);
        sessions.recover(record);
      }

      return rpc;
    });
  }

  protected abstract getAgentConfig(): AgentConfig;
  protected abstract connectAcp(options: AcpConnectionOptions): Promise<Stream>;

  async fetch(request: Request): Promise<Response> {
    await this.rpc;

    return this.clients.upgrade(request);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const rpc = await this.rpc;
    await rpc.message(socket, message);
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    this.clients.close(socket, code, reason);
  }

  webSocketError(socket: WebSocket): void {
    this.clients.error(socket);
  }
}
