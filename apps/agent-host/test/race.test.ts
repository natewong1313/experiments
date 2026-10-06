import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import {
  agent,
  methods,
  type AgentConnection,
  PROTOCOL_VERSION,
  type PromptResponse,
} from "@agentclientprotocol/sdk";
import { expect, it, vi } from "vitest";
import { websocketStream } from "@experiments/agent-host/helpers";
import { HostStore } from "../src/state/store";
import type { LiveSession } from "../src/sessions/record";
import { connectPeer, type Peer } from "./peer";

const SESSION = "ahp-session:/reused";

const SWITCHING_PROTOCOLS = 101;

const REOPEN_CALL = 2;

const TOTAL_CONNECTIONS = 3;

async function recordFor(stub: DurableObjectStub): Promise<LiveSession> {
  return await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();

    return new HostStore(state).requireWithActiveOutput(SESSION);
  });
}

async function waitForReady(stub: DurableObjectStub): Promise<void> {
  await vi.waitFor(async () => {
    const record = await recordFor(stub);
    expect(record.session.lifecycle).toBe("ready");
  });
}

function startTurn(peer: Peer, chat: string, clientSeq: number): void {
  peer.notify("dispatchAction", {
    channel: chat,
    clientSeq,
    action: {
      type: "chat/turnStarted",
      turnId: "same-turn-id",
      startedAt: "2026-10-01T00:00:00.000Z",
      message: { text: "Hello", origin: { kind: "user" } },
    },
  });
}

it("a delayed failure of an old turn cannot stop a recreated session's turn", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  const sockets: WebSocket[] = [];
  const servers: AgentConnection[] = [];
  const pendingFetch = Promise.withResolvers<Response>();
  const replacementPrompt = Promise.withResolvers<PromptResponse>();
  let calls = 0;
  let prompts = 0;

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    calls++;

    if (calls === REOPEN_CALL) {
      return await pendingFetch.promise;
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const sessionId = crypto.randomUUID();

    const connection = agent()
      .onRequest(methods.agent.initialize, () => ({ protocolVersion: PROTOCOL_VERSION }))
      .onRequest(methods.agent.session.new, () => ({ sessionId }))
      .onRequest(methods.agent.session.prompt, async () => {
        prompts++;

        return await replacementPrompt.promise;
      })
      .connect(websocketStream(server));

    servers.push(connection);
    sockets.push(server);

    return new Response(null, {
      status: SWITCHING_PROTOCOLS,
      webSocket: client,
    });
  });

  const peer = await connectPeer(stub);

  try {
    await peer.request("createSession", { channel: SESSION });
    await waitForReady(stub);
    const original = await recordFor(stub);
    await runInDurableObject(stub, async (instance) => {
      expect(instance).toBeDefined();
      sockets[0]?.close();
      await servers[0]?.closed;
    });
    startTurn(peer, original.chatUri, 1);
    await vi.waitFor(() => {
      expect(calls).toBe(REOPEN_CALL);
    });
    const disposal = peer.request("disposeSession", { channel: SESSION });
    await vi.waitFor(async () => {
      await runInDurableObject(stub, (instance, state) => {
        expect(instance).toBeDefined();
        const store = new HostStore(state);
        expect(store.lookupWithActiveOutput(SESSION)).toBeNull();
      });
    });
    await peer.request("createSession", { channel: SESSION });
    await waitForReady(stub);
    const replacement = await recordFor(stub);
    expect(replacement.sessionKey).not.toBe(original.sessionKey);
    startTurn(peer, replacement.chatUri, REOPEN_CALL);
    await vi.waitFor(() => {
      expect(prompts).toBe(1);
    });
    pendingFetch.reject(new Error("Old connection setup failed"));
    await disposal;
    await peer.request("ping", { channel: "ahp-root://" });
    replacementPrompt.resolve({ stopReason: "end_turn" });
    await vi.waitFor(async () => {
      const record = await recordFor(stub);
      expect(record.chat.activeTurn).toBeUndefined();

      const snapshot = await peer.request("subscribe", {
        channel: record.chatUri,
      });

      expect(snapshot).toMatchObject({
        snapshot: {
          state: { turns: [{ id: "same-turn-id", state: "complete" }] },
        },
      });
    });
    expect(fetchSpy).toHaveBeenCalledTimes(TOTAL_CONNECTIONS);
  } finally {
    pendingFetch.reject(new Error("Test finished"));
    replacementPrompt.resolve({ stopReason: "end_turn" });
    peer.close();
    await runInDurableObject(stub, async (instance) => {
      expect(instance).toBeDefined();

      for (const socket of sockets) {
        socket.close();
      }

      await Promise.all(servers.map((server) => server.closed));
    });
    fetchSpy.mockRestore();
  }
});
