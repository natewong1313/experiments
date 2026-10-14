import { DurableObject } from "cloudflare:workers";
import * as z from "zod";
import {
  AhpErrorCodes,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
} from "@microsoft/agent-host-protocol";
import type {
  AgentInfo as AHPAgentInfo,
  RootState as AHPRootState,
} from "@microsoft/agent-host-protocol";
import { StateActionSchema, SessionSummarySchema } from "@experiments/protocol-schemas/ahp";
import {
  MessageSchema,
  ProtocolError,
  ROOT_CHANNEL,
  channelId,
  send,
  errorMessage,
} from "../protocol";
import { HostSessionUpdateError } from "../rpc/host";
import type { HostRPC, HostSessionUpdateRequest } from "../rpc/host";
import type { SessionRPC, SessionNamespace } from "../rpc/session";
import { HostDatabase } from "./db/database";
import type { SessionEntry } from "./db/schema";
import { Connections } from "./connections";
import { handleRequest } from "./requests";
import { hostIdFromRequest } from "./router";
import { chatUri, sessionDOName, sessionUri } from "../shared/lookups";

const SOCKET_CLOSED_CODE = 1000;

export abstract class AgentHost<Env = unknown> extends DurableObject<Env> implements HostRPC {
  protected readonly db = new HostDatabase(this.ctx.storage);
  readonly connections = new Connections(this.ctx);
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
    const sessions = await this.db.sessions.list();

    return {
      agents: [this.getAgentInfo()],
      activeSessions: sessions.length,
    };
  }

  async sessionStub(id: string): Promise<SessionRPC> {
    const host = await this.db.host.get();
    if (!host) {
      throw new ProtocolError("Host is not initialized");
    }

    return this.getSessionNamespace().getByName(sessionDOName(host.id, id));
  }

  async resolveSession(channel: string): Promise<SessionEntry> {
    const entry = channel.startsWith("ahp-session:/")
      ? await this.db.sessions.get(channelId(channel, "ahp-session"))
      : await this.db.sessions.findChat(channelId(channel, "ahp-chat"));

    if (!entry) {
      throw new ProtocolError("Session does not exist", AhpErrorCodes.SessionNotFound);
    }

    return entry;
  }

  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    try {
      const parsed = z
        .object({
          sessionId: z.string(),
          revision: z.number(),
          summary: SessionSummarySchema,
          actions: z.array(
            z.object({
              channel: z.string(),
              action: StateActionSchema,
              origin: z.object({ clientId: z.string(), clientSeq: z.number() }).optional(),
            }),
          ),
        })
        .parse(req);

      const publication = parsed;
      const entry = await this.db.sessions.get(publication.sessionId);

      if (!entry) {
        return;
      }

      await this.db.sessions.update(entry.id, req.summary);

      await Promise.all(
        publication.actions.map(async (item) => {
          const envelope = {
            ...item,
            serverSeq: await this.db.host.nextSequence(),
            origin: item.origin,
          };

          this.connections.broadcast({ envelope, revision: publication.revision });
        }),
      );

      if (JSON.stringify(entry.summary) !== JSON.stringify(publication.summary)) {
        const {
          resource: _resource,
          createdAt: _createdAt,
          provider: _provider,
          ...changes
        } = publication.summary;

        this.connections.notify(ROOT_CHANNEL, {
          jsonrpc: "2.0",
          method: "root/sessionSummaryChanged",
          params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id), changes },
        });
      }
    } catch (error) {
      throw new HostSessionUpdateError(errorMessage(error));
    }
  }

  async catalogueChanged(): Promise<void> {
    const sessions = await this.db.sessions.list();
    const serverSeq = await this.db.host.nextSequence();
    this.connections.broadcast({
      revision: serverSeq,
      envelope: {
        channel: ROOT_CHANNEL,
        serverSeq,
        action: {
          type: "root/activeSessionsChanged",
          activeSessions: sessions.length,
        },
      },
    });
  }

  async disposeSession(entry: SessionEntry): Promise<void> {
    const stub = await this.sessionStub(entry.id);
    await stub.dispose();
    await this.db.sessions.remove(entry.id);
    this.connections.removeChannel(sessionUri(entry.id));
    this.connections.removeChannel(chatUri(entry.defaultChatId));
    this.connections.notify(ROOT_CHANNEL, {
      jsonrpc: "2.0",
      method: "root/sessionRemoved",
      params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id) },
    });
    await this.catalogueChanged();
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
      await handleRequest({ host: this, db: this.db, socket, message });
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
