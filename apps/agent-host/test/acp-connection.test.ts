import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { AgentConnections } from "../src/agent/acp";
import { HostStore } from "../src/state/store";
import { createSession } from "./config";

import {
  AgentSideConnection,
  PROTOCOL_VERSION,
  type Agent,
} from "@agentclientprotocol/sdk";
import { websocketStream } from "../src/agent/websocket-stream";
import { AGENT_IDLE_TIMEOUT_MS, MAX_AGENT_CONNECTIONS } from "../src/memory";
import type { AgentBinding } from "../src/sessions/record";

const CONNECT_TIMEOUT_MS = 30_000;

async function connectionError(
  operation: Promise<unknown>,
): Promise<Error | null> {
  try {
    await operation;

    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

it("aborts a stalled connector and closes a socket returned after its deadline", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    const uri = "ahp-session:/timeout";
    createSession(store, uri, "timeout-key");
    const pending = Promise.withResolvers<WebSocket>();
    const signals: AbortSignal[] = [];
    const keys: string[] = [];

    const agents = new AgentConnections({
      connect: ({ sessionKey, signal }): Promise<WebSocket> => {
        keys.push(sessionKey);
        signals.push(signal);

        return pending.promise;
      },
      updates: (): void => {},
    });

    vi.useFakeTimers();

    try {
      const record = store.require(uri);
      const failed = connectionError(agents.get(record));
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
      expect(await failed).toMatchObject({
        message: "Agent operation timed out",
      });
      expect(signals[0]?.aborted).toBe(true);
      expect(keys).toEqual(["timeout-key"]);
    } finally {
      vi.useRealTimers();
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const closed = Promise.withResolvers<boolean>();
    server.addEventListener("close", () => {
      closed.resolve(true);
    });
    server.accept();
    pending.resolve(client);
    await closed.promise;
    expect(server.readyState).toBe(WebSocket.CLOSED);
  });
});

it("caps pending agent connections and frees capacity after a failed setup", async () => {
  const signals: AbortSignal[] = [];

  const agents = new AgentConnections({
    connect: ({ signal }): Promise<WebSocket> => {
      signals.push(signal);

      return Promise.withResolvers<WebSocket>().promise;
    },
    updates: (): void => {},
  });

  vi.useFakeTimers();

  try {
    const records = Array.from({ length: MAX_AGENT_CONNECTIONS }, (_, index) =>
      binding(String(index)),
    );

    const pending = records.map((record) =>
      connectionError(agents.get(record)),
    );

    const overflow = binding("overflow");

    await expect(agents.get(overflow)).rejects.toThrow("capacity reached");
    expect(signals).toHaveLength(MAX_AGENT_CONNECTIONS);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    const failures = await Promise.all(pending);
    expect(
      failures.every((error) => error?.message === "Agent operation timed out"),
    ).toBe(true);
    const nextRecord = binding("next");
    const next = connectionError(agents.get(nextRecord));
    expect(signals).toHaveLength(MAX_AGENT_CONNECTIONS + 1);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    expect(await next).toMatchObject({ message: "Agent operation timed out" });
  } finally {
    vi.useRealTimers();
  }
});

function binding(key: string): AgentBinding {
  return {
    uri: `ahp-session:/${key}`,
    sessionKey: key,
    acpSession: null,
    session: { workingDirectories: ["file:///workspace"] },
  };
}

type LocalAgents = {
  agents: AgentConnections;
  servers: Map<string, WebSocket>;
  loads: string[];
};

function localAgents(loadSession: boolean): LocalAgents {
  const servers: Map<string, WebSocket> = new Map();
  const loads: string[] = [];

  const agents = new AgentConnections({
    connect: async ({ sessionKey }): Promise<WebSocket> => {
      const { 0: client, 1: server } = new WebSocketPair();
      new AgentSideConnection(
        (): Agent => ({
          initialize: async () => ({
            protocolVersion: PROTOCOL_VERSION,
            agentCapabilities: { loadSession },
          }),
          authenticate: async () => ({}),
          newSession: async () => ({ sessionId: sessionKey }),
          loadSession: async (request) => {
            loads.push(request.sessionId);

            return {};
          },
          prompt: async () => ({ stopReason: "end_turn" }),
          cancel: async (): Promise<void> => {},
        }),
        websocketStream(server),
      );
      server.accept();
      servers.set(sessionKey, server);

      return client;
    },
    updates: (): void => {},
  });

  return { agents, servers, loads };
}

it.each([true, false])(
  "expires idle connections only when the backend supports reload: %s",
  async (reloadable) => {
    const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
    await runInDurableObject(stub, async (instance) => {
      expect(instance).toBeDefined();
      const { agents, loads } = localAgents(reloadable);
      const record = binding("idle");
      const agent = await agents.get(record);
      vi.useFakeTimers();

      try {
        await agents.idle(record);
        await vi.advanceTimersByTimeAsync(AGENT_IDLE_TIMEOUT_MS);

        await vi.waitFor(() => {
          expect(agent.closed).toBe(reloadable);
        });

        const reused = await agents.get({
          ...record,
          acpSession: agent.sessionId,
        });

        expect(reused === agent).toBe(!reloadable);
        expect(loads).toEqual(reloadable ? [agent.sessionId] : []);
      } finally {
        vi.useRealTimers();
        await agents.release(record);
      }
    });
  },
);

it("cancels idle expiry when a conversation is reused", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (instance) => {
    expect(instance).toBeDefined();
    const { agents } = localAgents(true);
    const record = binding("busy");
    const agent = await agents.get(record);
    vi.useFakeTimers();

    try {
      await agents.idle(record);
      expect(await agents.get(record)).toBe(agent);
      await vi.advanceTimersByTimeAsync(AGENT_IDLE_TIMEOUT_MS);
      expect(agent.closed).toBe(false);
    } finally {
      vi.useRealTimers();
      await agents.release(record);
    }
  });
});

it("removes remotely closed connections without waiting for another lookup of that session", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (instance) => {
    expect(instance).toBeDefined();
    const { agents, servers } = localAgents(false);

    const records = Array.from({ length: MAX_AGENT_CONNECTIONS }, (_, index) =>
      binding(String(index)),
    );

    const opened = await Promise.all(
      records.map((record) => agents.get(record)),
    );

    const overflow = binding("overflow");

    try {
      await expect(agents.get(overflow)).rejects.toThrow("capacity reached");
      servers.get("0")?.close();
      await vi.waitFor(() => {
        expect(opened[0]?.closed).toBe(true);
      });
      const next = await agents.get(binding("next"));
      expect(next.closed).toBe(false);
      await agents.release(binding("next"));
    } finally {
      await Promise.all(records.map((record) => agents.release(record)));
    }
  });
});
