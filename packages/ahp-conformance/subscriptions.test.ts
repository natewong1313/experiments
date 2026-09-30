import { ReconnectResultSchema } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { expectRootState, initialized, ROOT, VERSION, withClient } from "./client";

describe("subscriptions and reconnection", () => {
  it("subscribes to root after initialize", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const subscribed = await client.subscribe(ROOT);
      const state = expectRootState(subscribed.result.snapshot);
      expect(Array.isArray(state.agents)).toBe(true);
    });
  });

  it("returns root state in an explicit subscription", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const subscribed = await client.subscribe(ROOT);
      expect(Array.isArray(expectRootState(subscribed.result.snapshot).agents)).toBe(true);
    });
  });

  it("accepts an immediate-delivery preference", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const subscribed = await client.subscribe(ROOT, { delivery: { maxLatencyMs: 0 } });
      const state = expectRootState(subscribed.result.snapshot);
      expect(Array.isArray(state.agents)).toBe(true);
    });
  });

  it("remains responsive after unsubscribe", async () => {
    await withClient(async (client) => {
      await initialized(client, [ROOT]);
      await client.unsubscribe(ROOT);
      const pong = await client.ping();
      expect(pong).toBeUndefined();
    });
  });

  it("allows resubscription after unsubscribe", async () => {
    await withClient(async (client) => {
      await initialized(client, [ROOT]);
      await client.unsubscribe(ROOT);
      const subscribed = await client.subscribe(ROOT);
      const state = expectRootState(subscribed.result.snapshot);
      expect(Array.isArray(state.agents)).toBe(true);
    });
  });

  it("allows root subscription on two simultaneous clients", async () => {
    const agentCounts: number[] = [];
    await withClient(async (first) => {
      await initialized(first, [ROOT]);
      await withClient(async (second) => {
        const result = await initialized(second, [ROOT]);
        const [snapshot] = result.snapshots;
        if (!snapshot) {
          throw new Error("Expected a root snapshot");
        }
        agentCounts.push(expectRootState(snapshot).agents.length);
        await first.ping();
      });
    });
    const [agentCount] = agentCounts;
    expect(agentCount).toBeGreaterThan(0);
  });

  it("reports replay or snapshots on reconnect", async () => {
    const clientId = `conformance-${crypto.randomUUID()}`;
    const serverSeq = await captureServerSeq(clientId, [ROOT]);
    await withClient(async (client) => {
      const result = ReconnectResultSchema.parse(await client.reconnect({
        clientId, lastSeenServerSeq: serverSeq, subscriptions: [ROOT],
      }));
      expect(["replay", "snapshot"]).toContain(result.type);
    });
  });

  it("returns ordered replay actions when replaying", async () => {
    const clientId = `conformance-${crypto.randomUUID()}`;
    const serverSeq = await captureServerSeq(clientId, [ROOT]);
    await withClient(async (client) => {
      const result = ReconnectResultSchema.parse(await client.reconnect({
        clientId, lastSeenServerSeq: serverSeq, subscriptions: [ROOT],
      }));
      if (result.type !== "replay") {
        return;
      }
      let previous = serverSeq;
      for (const action of result.actions) {
        expect(action.serverSeq).toBeGreaterThan(previous);
        previous = action.serverSeq;
      }
    });
  });

  it("returns snapshots with matching resources when replay is unavailable", async () => {
    const clientId = `conformance-${crypto.randomUUID()}`;
    const serverSeq = await captureServerSeq(clientId, [ROOT]);
    await withClient(async (client) => {
      const result = ReconnectResultSchema.parse(await client.reconnect({
        clientId, lastSeenServerSeq: serverSeq, subscriptions: [ROOT],
      }));
      if (result.type !== "snapshot") {
        return;
      }
      const snapshot = result.snapshots.find((item) => item.resource === ROOT);
      const state = expectRootState(snapshot);
      expect(Array.isArray(state.agents)).toBe(true);
    });
  });

  it("continues handling ping after reconnect", async () => {
    const clientId = `conformance-${crypto.randomUUID()}`;
    const serverSeq = await captureServerSeq(clientId, []);
    await withClient(async (client) => {
      await client.reconnect({ clientId, lastSeenServerSeq: serverSeq, subscriptions: [] });
      const pong = await client.ping();
      expect(pong).toBeUndefined();
    });
  });

  it("accepts a fresh initialized connection after another client closes", async () => {
    await withClient(async (client) => {
      await initialized(client);
    });
    await withClient(async (client) => {
      const result = await initialized(client);
      expect(result.protocolVersion).toBe(VERSION);
    });
  });
});

async function captureServerSeq(clientId: string, subscriptions: string[]): Promise<number> {
  return await withClient(async (client) => {
    const result = await client.initialize({ clientId, protocolVersions: [VERSION], initialSubscriptions: subscriptions });
    return result.serverSeq;
  });
}
