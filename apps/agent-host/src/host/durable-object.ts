import { DurableObject } from "cloudflare:workers";
import { JsonRpcErrorCodes as AHPJsonRpcErrorCodes } from "@microsoft/agent-host-protocol";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import { MessageSchema, ProtocolError, errorMessage, sendError } from "../protocol";
import { HostSessionUpdateError } from "../shared/rpc/host";
import type { HostRPC, HostSessionUpdateRequest } from "../shared/rpc/host";
import type { SessionNamespace } from "../shared/rpc/session";
import { HostDatabase } from "./db/database";
import { ConnectionsService } from "./service/connections";
import { HostSessionsService } from "./service/sessions";
import { handleMessage } from "./requests";
import type { Host } from "./requests";

const SOCKET_CLOSED_CODE = 1000;

export abstract class AgentHost<Env = unknown> extends DurableObject<Env> implements HostRPC {
  private db = new HostDatabase(this.ctx.storage);
  private connections = new ConnectionsService(this.ctx);
  private sessions = new HostSessionsService({
    hostId: hostId(this.ctx.id),
    db: this.db,
    connections: this.connections,
    agentInfo: (): AHPAgentInfo => this.getAgentInfo(),
    sessionNamespace: (): SessionNamespace => this.getSessionNamespace(),
  });

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
    await this.connections.serialize(socket, () => this.handleWebsocketMessage(socket, message));
  }

  webSocketClose(socket: WebSocket): void {
    socket.close(SOCKET_CLOSED_CODE, "Connection closed");
  }

  webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket);
  }

  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    await this.sessions.sessionUpdate(req).catch((error) => {
      throw new HostSessionUpdateError(errorMessage(error));
    });
  }

  private async handleWebsocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    const host: Host = { sessions: this.sessions, connections: this.connections };
    // Unparsed messages are answered with a null ID; notifications are never answered.
    let id: string | number | null | undefined = null;

    try {
      if (raw instanceof ArrayBuffer) {
        throw new ProtocolError("Expected a text frame", AHPJsonRpcErrorCodes.InvalidRequest);
      }

      const message = MessageSchema.parse(JSON.parse(raw));
      ({ id } = message);
      await handleMessage(host, socket, message);
    } catch (error) {
      if (id !== undefined) {
        const failure =
          error instanceof ProtocolError ? error : new ProtocolError(errorMessage(error));

        sendError(socket, id, failure);
      }
    }
  }
}

function hostId(id: DurableObjectId): string {
  if (id.name === undefined) {
    throw new Error("AgentHost must be addressed by name, for example with getByName()");
  }

  return id.name;
}
