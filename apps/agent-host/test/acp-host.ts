import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import {
  agent,
  methods,
  type AgentConnection,
  PROTOCOL_VERSION,
  type PromptRequest,
  type SessionNotification,
  type AgentContext,
  type PromptResponse,
} from "@agentclientprotocol/sdk";
import { SessionStateSchema, SubscribeResultSchema } from "@experiments/protocol-schemas/ahp";
import { expect, vi } from "vitest";
import { websocketStream } from "../src/agent/websocket-stream";
import { connectPeer, type Peer } from "./peer";

const SESSION = "ahp-session:/host-test";

const SWITCHING_PROTOCOLS = 101;

const LAST_CONNECTION = -1;

type WithAcpAgentParams = {
  prompt(connection: AgentConnection, request: PromptRequest): Promise<PromptResponse>;
  cancel?(): Promise<void>;
  setup?(client: AgentContext, sessionId: string): Promise<void>;
  run(
    peer: Peer,
    chat: string,
    disconnect: () => Promise<void>,
    notify: (notification: SessionNotification) => Promise<void>,
  ): Promise<void>;
};

async function withAcpAgent(options: WithAcpAgentParams): Promise<void> {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  const sockets: WebSocket[] = [];
  const servers: AgentConnection[] = [];

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const { 0: client, 1: server } = new WebSocketPair();

    const connection: AgentConnection = agent()
      .onRequest(methods.agent.initialize, () => ({
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
      }))
      .onRequest(methods.agent.session.new, async ({ client: host }) => {
        await options.setup?.(host, "conversation");

        return { sessionId: "conversation" };
      })
      .onRequest(methods.agent.session.load, async ({ params: request, client: host }) => {
        expect(request).toMatchObject({
          sessionId: "conversation",
          cwd: "/workspace",
          mcpServers: [],
        });
        await host.notify(methods.client.session.update, {
          sessionId: request.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Old history" },
          },
        });

        return {};
      })
      .onRequest(methods.agent.session.prompt, ({ params }) => options.prompt(connection, params))
      .onNotification(methods.agent.session.cancel, async () => {
        await options.cancel?.();
      })
      .connect(websocketStream(server));

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
    await options.run(peer, session.defaultChat, disconnect, async (notification) => {
      await runInDurableObject(stub, async (instance) => {
        expect(instance).toBeDefined();
        const connection = servers.at(LAST_CONNECTION);

        if (!connection) {
          throw new Error("No ACP connection");
        }

        await connection.client.notify(methods.client.session.update, notification);
      });
    });
  } finally {
    peer.close();
    await disconnect();
    fetchSpy.mockRestore();
  }
}

export { withAcpAgent };
