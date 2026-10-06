import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { AgentConnections } from "../src/agent/acp";
import { HostStore } from "../src/state/store";
import { createSession } from "./config";

import {
  agent as createAgent,
  methods,
  PROTOCOL_VERSION,
  type Stream,
} from "@agentclientprotocol/sdk";
import { websocketStream } from "@experiments/agent-host/helpers";
import { AGENT_IDLE_TIMEOUT_MS, MAX_AGENT_CONNECTIONS } from "../src/memory";
import type { AgentBinding } from "../src/sessions/record";

const CONNECT_TIMEOUT_MS = 30_000;

async function connectionError(operation: Promise<unknown>): Promise<Error | null> {
  try {
    await operation;

    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

it("aborts a stalled connector and disposes a stream returned after its deadline", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    const uri = "ahp-session:/timeout";
    createSession(store, uri, "timeout-key");
    const pending = Promise.withResolvers<Stream>();
    const signals: AbortSignal[] = [];
    const keys: string[] = [];

    const agents = new AgentConnections({
      connect: ({ sessionKey, signal }): Promise<Stream> => {
        keys.push(sessionKey);
        signals.push(signal);

        return pending.promise;
      },
      updates: (): void => {},
    });

    vi.useFakeTimers();

    try {
      const record = store.requireWithActiveOutput(uri);
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
    pending.resolve(websocketStream(client));
    await closed.promise;
    expect(server.readyState).toBe(WebSocket.CLOSED);
  });
});

it("caps pending agent connections and frees capacity after a failed setup", async () => {
  const signals: AbortSignal[] = [];

  const agents = new AgentConnections({
    connect: ({ signal }): Promise<Stream> => {
      signals.push(signal);

      return Promise.withResolvers<Stream>().promise;
    },
    updates: (): void => {},
  });

  vi.useFakeTimers();

  try {
    const records = Array.from({ length: MAX_AGENT_CONNECTIONS }, (_, index) =>
      binding(String(index)),
    );

    const pending = records.map((record) => connectionError(agents.get(record)));

    const overflow = binding("overflow");

    await expect(agents.get(overflow)).rejects.toThrow("capacity reached");
    expect(signals).toHaveLength(MAX_AGENT_CONNECTIONS);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    const failures = await Promise.all(pending);
    expect(failures.every((error) => error?.message === "Agent operation timed out")).toBe(true);
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
    connect: async ({ sessionKey }): Promise<Stream> => {
      const { 0: client, 1: server } = new WebSocketPair();
      createAgent()
        .onRequest(methods.agent.initialize, () => ({
          protocolVersion: PROTOCOL_VERSION,
          agentCapabilities: { loadSession },
        }))
        .onRequest(methods.agent.session.new, () => ({ sessionId: sessionKey }))
        .onRequest(methods.agent.session.load, ({ params }) => {
          loads.push(params.sessionId);

          return {};
        })
        .onRequest(methods.agent.session.prompt, () => ({ stopReason: "end_turn" }))
        .connect(websocketStream(server));
      servers.set(sessionKey, server);

      return websocketStream(client);
    },
    updates: (): void => {},
  });

  return { agents, servers, loads };
}

it("shares connection setup between concurrent callers", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (instance) => {
    expect(instance).toBeDefined();
    const { agents } = localAgents(true);
    const record = binding("shared");

    try {
      const [first, second] = await Promise.all([agents.get(record), agents.get(record)]);
      expect(second).toBe(first);
      expect(first.closed).toBe(false);
    } finally {
      await agents.release(record);
    }
  });
});

it("removes failed shared setup so a later caller can retry", async () => {
  const setup = Promise.withResolvers<Stream>();
  let attempts = 0;

  const agents = new AgentConnections({
    connect: (): Promise<Stream> => {
      attempts += 1;

      return setup.promise;
    },
    updates: (): void => {},
  });

  const record = binding("failed");
  const first = connectionError(agents.get(record));
  const second = connectionError(agents.get(record));
  const failure = new Error("Connector failed");
  setup.reject(failure);

  expect(await first).toBe(failure);
  expect(await second).toBe(failure);
  expect(attempts).toBe(1);
  const attemptsBeforeRetry = attempts;
  const retry = await connectionError(agents.get(record));

  expect(retry).toBe(failure);
  expect(attempts).toBe(attemptsBeforeRetry + 1);
});

it("keeps a replacement cached when the previous connection closes", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (instance) => {
    expect(instance).toBeDefined();
    const { agents } = localAgents(true);
    const record = binding("replacement");
    const previous = await agents.get(record);

    try {
      const released = agents.release(record);
      const replacement = agents.get(record);
      await released;
      const current = await replacement;

      await vi.waitFor(() => {
        expect(previous.closed).toBe(true);
      });

      expect(current).not.toBe(previous);
      expect(current.closed).toBe(false);
      expect(await agents.get(record)).toBe(current);
    } finally {
      await agents.release(record);
    }
  });
});

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

    const opened = await Promise.all(records.map((record) => agents.get(record)));

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
