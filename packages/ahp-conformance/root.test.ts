import { ListSessionsResultSchema, type RootState } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { expectRootState, initialized, ROOT, withClient } from "./client";

async function rootState(): Promise<RootState> {
  return await withClient(async (client) => {
    const result = await initialized(client, [ROOT]);
    const [snapshot] = result.snapshots;
    if (!snapshot) {

      throw new Error("Expected a root snapshot");

    }
    return expectRootState(snapshot);
  });
}

describe("root state and session catalogue", () => {
  it("contains an agent array", async () => {
    const state = await rootState();
    expect(Array.isArray(state.agents)).toBe(true);
  });

  it("gives each agent a provider identifier and display name", async () => {
    const state = await rootState();
    for (const agent of state.agents) {
      expect(typeof agent.provider).toBe("string");
      expect(agent.displayName.length).toBeGreaterThan(0);
    }
  });

  it("uses unique provider identifiers", async () => {
    const state = await rootState();
    const providers = state.agents.map((agent) => agent.provider);
    expect(new Set(providers).size).toBe(providers.length);
  });

  it("exposes a nonnegative active session count when present", async () => {
    const state = await rootState();
    const count = state.activeSessions;
    if (!count && count !== 0) {
      return;
    }
    expect(Number.isSafeInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("exposes a terminal catalogue array when present", async () => {
    const state = await rootState();
    const { terminals } = state;
    if (!terminals) {
      return;
    }
    expect(Array.isArray(terminals)).toBe(true);
  });

  it("returns a session catalogue array", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const page = ListSessionsResultSchema.parse(await client.request("listSessions", { channel: ROOT }));
      expect(Array.isArray(page.items)).toBe(true);
    });
  });

  it.each([1, 2, 10])("accepts listSessions limit %i", async (limit) => {
    await withClient(async (client) => {
      await initialized(client);
      const page = ListSessionsResultSchema.parse(await client.request("listSessions", { channel: ROOT, limit }));
      expect(Array.isArray(page.items)).toBe(true);
      const { nextCursor } = page;
      if (!nextCursor) {
        return;
      }
      expect(typeof nextCursor).toBe("string");
    });
  });

  it("gives each listed session a URI, provider, and title", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const page = ListSessionsResultSchema.parse(await client.request("listSessions", { channel: ROOT, limit: 10 }));
      for (const item of page.items) {
        expect(item.resource.startsWith("ahp-session:/")).toBe(true);
        expect(item.provider.length).toBeGreaterThan(0);
        expect(item.title.length).toBeGreaterThan(0);
      }
    });
  });

  it("follows an advertised catalogue cursor", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const first = ListSessionsResultSchema.parse(await client.request("listSessions", { channel: ROOT, limit: 1 }));
      if (!first.nextCursor) {
        return;
      }
      const second = ListSessionsResultSchema.parse(await client.request("listSessions", {
        channel: ROOT, limit: 1, cursor: first.nextCursor,
      }));
      expect(Array.isArray(second.items)).toBe(true);
    });
  });
});
