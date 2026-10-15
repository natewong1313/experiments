import { DurableObject } from "cloudflare:workers";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import { CloseCode } from "./websockets";
import { errorMessage } from "../shared/errors";
import { HostSessionUpdateError } from "../shared/rpc/host";
import type { HostRPC, HostSessionUpdateRequest } from "../shared/rpc/host";
import type { SessionNamespace } from "../shared/rpc/session";
import { HostDatabase } from "./db/database";
import { ConnectionsService } from "./service/connections";
import { HostSessionsService } from "./service/sessions";
import { AHPRouter } from "./router";

/**
 *
 */
export abstract class AgentHost<Env = unknown> extends DurableObject<Env> implements HostRPC {
  private db = new HostDatabase(this.ctx.storage);
  private connections = new ConnectionsService(this.ctx);
  private sessions = new HostSessionsService({
    hostId: this.ctx.id.name!,
    db: this.db,
    connections: this.connections,
    agentInfo: (): AHPAgentInfo => this.getAgentInfo(),
    sessionNamespace: (): SessionNamespace => this.getSessionNamespace(),
  });
  private router = new AHPRouter({ sessions: this.sessions, connections: this.connections });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.db.migrate();
    });
  }

  protected abstract getAgentInfo(): AHPAgentInfo;
  protected abstract getSessionNamespace(): SessionNamespace;

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.connections.accept(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.router.handleMessage(socket, message);
  }

  webSocketClose(socket: WebSocket): void {
    socket.close(CloseCode.Normal, "Connection closed");
  }

  webSocketError(socket: WebSocket): void {
    socket.close(CloseCode.InternalError, "Connection error");
  }

  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    await this.sessions.sessionUpdate(req).catch((error) => {
      throw new HostSessionUpdateError(errorMessage(error));
    });
  }
}
