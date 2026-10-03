import { DurableObject } from "cloudflare:workers";
import { agent, methods, PROTOCOL_VERSION, type AgentConnection } from "@agentclientprotocol/sdk";
import { websocketStream } from "../src/agent/websocket-stream";

const STATUS_SWITCHING_PROTOCOLS = 101;

const STATUS_UNAUTHORIZED = 401;

type BackendEvent =
  | { kind: "connect"; sessionKey: string }
  | { kind: "new" | "load"; cwd: string; sessionId: string }
  | { kind: "prompt"; sessionId: string };

class AcpBackend extends DurableObject {
  private readonly connections: Map<WebSocket, AgentConnection> = new Map();

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

    const connection = agent()
      .onRequest(methods.agent.initialize, async () => ({
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: (await this.ctx.storage.get<boolean>("loadSupported")) ?? true,
        },
      }))
      .onRequest(methods.agent.session.new, async ({ params: { cwd } }) => {
        const sessionId = crypto.randomUUID();
        await this.record({ kind: "new", cwd, sessionId });

        return { sessionId };
      })
      .onRequest(methods.agent.session.load, async ({ params: { cwd, sessionId } }) => {
        await this.record({ kind: "load", cwd, sessionId });

        return {};
      })
      .onRequest(methods.agent.session.prompt, async ({ params: { sessionId }, client: host }) => {
        await this.record({ kind: "prompt", sessionId });
        await host.notify(methods.client.session.update, {
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Custom reply" },
          },
        });

        return { stopReason: "end_turn" };
      })
      .connect(websocketStream(server));

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
