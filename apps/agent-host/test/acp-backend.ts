import { DurableObject } from "cloudflare:workers";
import { AgentSideConnection, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { Agent } from "@agentclientprotocol/sdk";
import { websocketStream } from "../src/agent/websocket-stream";

const STATUS_SWITCHING_PROTOCOLS = 101;

const STATUS_UNAUTHORIZED = 401;

type BackendEvent =
  | { kind: "connect"; sessionKey: string }
  | { kind: "new" | "load"; cwd: string; sessionId: string }
  | { kind: "prompt"; sessionId: string };

class AcpBackend extends DurableObject {
  private readonly connections: Map<WebSocket, AgentSideConnection> = new Map();

  async events(): Promise<BackendEvent[]> {
    return (await this.ctx.storage.get<BackendEvent[]>("events")) ?? [];
  }

  async setLoadSupport(enabled: boolean): Promise<void> {
    await this.ctx.storage.put("loadSupported", enabled);
  }

  async closeConnections(): Promise<void> {
    const connections = [...this.connections.values()];

    for (const socket of this.connections.keys()) {
      socket.close();
    }

    await Promise.all(connections.map((connection) => connection.closed));
  }

  connectionCount(): number {
    return this.connections.size;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Authorization") !== "Bearer test-token") {
      return new Response("Unauthorized", { status: STATUS_UNAUTHORIZED });
    }

    const sessionKey = request.headers.get("X-Session-Key");

    if (sessionKey === null) {
      throw new Error("Missing session key");
    }

    await this.record({ kind: "connect", sessionKey });
    const { 0: client, 1: server } = new WebSocketPair();

    const connection = new AgentSideConnection(
      (): Agent => ({
        initialize: async () => ({
          protocolVersion: PROTOCOL_VERSION,
          agentCapabilities: {
            loadSession: (await this.ctx.storage.get<boolean>("loadSupported")) ?? true,
          },
        }),
        authenticate: async () => ({}),
        newSession: async ({ cwd }) => {
          const sessionId = crypto.randomUUID();
          await this.record({ kind: "new", cwd, sessionId });

          return { sessionId };
        },
        loadSession: async ({ cwd, sessionId }) => {
          await this.record({ kind: "load", cwd, sessionId });

          return {};
        },
        prompt: async ({ sessionId }) => {
          await this.record({ kind: "prompt", sessionId });
          await connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "Custom reply" },
            },
          });

          return { stopReason: "end_turn" };
        },
        cancel: async (): Promise<void> => {},
      }),
      websocketStream(server),
    );

    server.accept();
    this.connections.set(server, connection);
    server.addEventListener("close", () => {
      this.connections.delete(server);
    });

    return new Response(null, {
      status: STATUS_SWITCHING_PROTOCOLS,
      webSocket: client,
    });
  }

  private async record(event: BackendEvent): Promise<void> {
    const events = await this.events();
    await this.ctx.storage.put("events", [...events, event]);
  }
}

export { AcpBackend };
