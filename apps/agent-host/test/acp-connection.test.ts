import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { AgentConnections } from "../src/agent/acp";
import { HostStore } from "../src/state/store";
import { createSession } from "./config";

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
