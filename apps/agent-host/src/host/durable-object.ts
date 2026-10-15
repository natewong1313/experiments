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

  /**
   * Runs host database migrations before the DO processes events.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.db.migrate();
    });
  }

  /**
   * Returns the agent metadata for the root snapshot and the provider used to create sessions.
   */
  protected abstract getAgentInfo(): AHPAgentInfo;

  /**
   * Returns the namespace used to for session Durable Object stubs.
   */
  protected abstract getSessionNamespace(): SessionNamespace;

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.connections.accept(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handles JSON RPC messages over websockets.
   */
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.router.handleMessage(socket, message);
  }

  /**
   * Completes the close handshake with the normal closure code.
   */
  webSocketClose(socket: WebSocket): void {
    socket.close(CloseCode.Normal, "Connection closed");
  }

  /**
   * Closes the socket with the internal error code after a connection error.
   */
  webSocketError(socket: WebSocket): void {
    socket.close(CloseCode.InternalError, "Connection error");
  }

  /**
   * Stores a session summary and publishes its actions and summary changes to subscribers.
   * If the session is absent from the catalog, the host ignores the update after validation.
   *
   * @throws {HostSessionUpdateError} If validation, storage, or socket delivery fails.
   */
  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    await this.sessions.sessionUpdate(req).catch((error) => {
      throw new HostSessionUpdateError(errorMessage(error));
    });
  }
}
