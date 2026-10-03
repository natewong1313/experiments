import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import {
  AgentSideConnection,
  PROTOCOL_VERSION,
  type Agent,
  type PromptRequest,
  type PromptResponse,
} from "@agentclientprotocol/sdk";
import { SessionStateSchema, SubscribeResultSchema } from "@experiments/protocol-schemas/ahp";
import { expect, vi } from "vitest";
import { websocketStream } from "../src/agent/websocket-stream";
import { connectPeer, type Peer } from "./peer";

const SESSION = "ahp-session:/host-test";

const SWITCHING_PROTOCOLS = 101;

async function withAcpAgent(options: {
  prompt(connection: AgentSideConnection, request: PromptRequest): Promise<PromptResponse>;
  cancel?(): Promise<void>;
  run(peer: Peer, chat: string, disconnect: () => Promise<void>): Promise<void>;
}): Promise<void> {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  const sockets: WebSocket[] = [];
  const servers: AgentSideConnection[] = [];

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const { 0: client, 1: server } = new WebSocketPair();

    const connection = new AgentSideConnection(
      (): Agent => ({
        initialize: async () => ({
          protocolVersion: PROTOCOL_VERSION,
          agentCapabilities: { loadSession: true },
        }),
        newSession: async () => ({ sessionId: "conversation" }),
        loadSession: async (request) => {
          expect(request).toMatchObject({
            sessionId: "conversation",
            cwd: "/workspace",
            mcpServers: [],
          });
          await connection.sessionUpdate({
            sessionId: request.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "Old history" },
            },
          });

          return {};
        },
        authenticate: async () => ({}),
        prompt: async (request) => await options.prompt(connection, request),
        cancel: async (): Promise<void> => {
          await options.cancel?.();
        },
      }),
      websocketStream(server),
    );

    server.accept();
    sockets.push(server);
    servers.push(connection);

    return new Response(null, {
      status: SWITCHING_PROTOCOLS,
      webSocket: client,
    });
  });

  async function disconnect(): Promise<void> {
    await runInDurableObject(stub, async (instance) => {
      expect(instance).toBeDefined();

      for (const socket of sockets) {
        socket.close();
      }

      await Promise.all(servers.map((server) => server.closed));
    });
  }

  const peer = await connectPeer(stub);

  try {
    await peer.request("createSession", { channel: SESSION });

    const session = await vi.waitFor(async () => {
      const result = SubscribeResultSchema.parse(
        await peer.request("subscribe", { channel: SESSION }),
      );

      const state = SessionStateSchema.parse(result.snapshot?.state);
      expect(state.lifecycle).toBe("ready");

      return state;
    });

    if (session.defaultChat === void 0) {
      throw new Error("Ready session has no default chat");
    }

    await peer.request("subscribe", { channel: session.defaultChat });
    await options.run(peer, session.defaultChat, disconnect);
  } finally {
    peer.close();
    await disconnect();
    fetchSpy.mockRestore();
  }
}

export { withAcpAgent };
