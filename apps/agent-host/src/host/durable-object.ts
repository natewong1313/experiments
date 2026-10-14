import { DurableObject } from "cloudflare:workers";
import type * as z from "zod";
import { JsonRpcErrorCodes as AHPJsonRpcErrorCodes } from "@microsoft/agent-host-protocol";
import type {
  AgentInfo as AHPAgentInfo,
  RootState as AHPRootState,
} from "@microsoft/agent-host-protocol";
import { MessageSchema, ProtocolError, send, errorMessage } from "../protocol";
import { HostSessionUpdateError } from "../shared/rpc/host";
import type { HostRPC, HostSessionUpdateRequest } from "../shared/rpc/host";
import type { SessionRPC, SessionNamespace } from "../shared/rpc/session";
import { HostDatabase } from "./db/database";
import type { SessionEntry } from "./db/schema";
import { ConnectionsService } from "./service/connections";
import { HostSessionsService } from "./service/sessions";
import { handleRequest } from "./requests";
import { hostIdFromRequest } from "../helpers/router";

const SOCKET_CLOSED_CODE = 1000;

export abstract class AgentHost<Env = unknown> extends DurableObject<Env> implements HostRPC {
  private db = new HostDatabase(this.ctx.storage);
  private connections = new ConnectionsService(this.ctx);
  private sessions = new HostSessionsService({
    host: this.db.host,
    sessions: this.db.sessions,
    connections: this.connections,
    agentInfo: (): AHPAgentInfo => this.getAgentInfo(),
    sessionNamespace: (): SessionNamespace => this.getSessionNamespace(),
  });
  private messages: WeakMap<WebSocket, Promise<void>> = new WeakMap();

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

    const id = hostIdFromRequest(request);
    if (id === undefined) {
      return new Response("Not found", { status: 404 });
    }

    const currentHost = await this.db.host.get();
    if (currentHost && currentHost.id !== id) {
      // Invariant
      return new Response("Host ID does not match this object", { status: 404 });
    }

    await this.db.host.initialize(id);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ subscriptions: {} });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const previous = this.messages.get(socket) ?? Promise.resolve();
    const next = this.handleWebsocketMessage(previous, socket, message);
    this.messages.set(socket, next);
    await next;
  }

  webSocketClose(socket: WebSocket): void {
    this.connections.cancel(socket);
    socket.close(SOCKET_CLOSED_CODE, "Connection closed");
  }

  webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket);
  }

  agentInfo(): AHPAgentInfo {
    return this.getAgentInfo();
  }

  async rootState(): Promise<AHPRootState> {
    return await this.sessions.rootState();
  }

  async sessionStub(id: string): Promise<SessionRPC> {
    return await this.sessions.sessionStub(id);
  }

  async resolveSession(channel: string): Promise<SessionEntry> {
    return await this.sessions.resolveSession(channel);
  }

  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    try {
      await this.sessions.sessionUpdate(req);
    } catch (error) {
      throw new HostSessionUpdateError(errorMessage(error));
    }
  }

  async catalogueChanged(): Promise<void> {
    await this.sessions.catalogueChanged();
  }

  async disposeSession(entry: SessionEntry): Promise<void> {
    await this.sessions.dispose(entry);
  }

  private async handleWebsocketMessage(
    previous: Promise<void>,
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    await previous;
    let message: z.output<typeof MessageSchema> | undefined;

    try {
      if (raw instanceof ArrayBuffer) {
        throw new ProtocolError("Expected a text frame", AHPJsonRpcErrorCodes.InvalidRequest);
      }

      message = MessageSchema.parse(JSON.parse(raw));
      await handleRequest({
        sessions: this.sessions,
        connections: this.connections,
        hostRepository: this.db.host,
        socket,
        message,
      });
    } catch (error) {
      const code = error instanceof ProtocolError ? error.code : AHPJsonRpcErrorCodes.InvalidParams;

      if (!message || message.id !== undefined) {
        send(socket, {
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: { code, message: errorMessage(error) },
        });
      }
    }
  }
}
