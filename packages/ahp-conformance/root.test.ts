import type { AhpClient } from "@microsoft/agent-host-protocol/client";
import {
  ListSessionsResultSchema,
  type RootState,
} from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { expectRootState, initialized, ROOT, test } from "./client";

async function rootState(client: AhpClient): Promise<RootState> {
  const result = await initialized(client, [ROOT]);
  const [snapshot] = result.snapshots;

  if (!snapshot) {
    throw new Error("Expected a root snapshot");
  }

  return expectRootState(snapshot);
}

describe("root state and session catalogue", () => {
  test("contains an agent array", async ({ client }) => {
    const state = await rootState(client);
    expect(Array.isArray(state.agents)).toBe(true);
  });

  test("gives each agent a provider identifier and display name", async ({
    client,
  }) => {
    const state = await rootState(client);

    for (const agent of state.agents) {
      expect(agent.provider).toEqual(expect.any(String));
      expect(agent.displayName.length).toBeGreaterThan(0);
    }
  });

  test("uses unique provider identifiers", async ({ client }) => {
    const state = await rootState(client);
    const providers = state.agents.map((agent) => agent.provider);
    expect(new Set(providers).size).toBe(providers.length);
  });

  test("exposes a nonnegative active session count when present", async ({
    client,
  }) => {
    const state = await rootState(client);
    const count = state.activeSessions;

    if (!count && count !== 0) {
      return;
    }

    expect(Number.isSafeInteger(count)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("exposes a terminal catalogue array when present", async ({
    client,
  }) => {
    const state = await rootState(client);
    const { terminals } = state;

    if (!terminals) {
      return;
    }

    expect(Array.isArray(terminals)).toBe(true);
  });

  test("returns a session catalogue array", async ({ client }) => {
    await initialized(client);

    const page = ListSessionsResultSchema.parse(
      await client.request("listSessions", { channel: ROOT }),
    );

    expect(Array.isArray(page.items)).toBe(true);
  });

  test.for([1, 2, 10])(
    "accepts listSessions limit %i",
    async (limit, { client }) => {
      await initialized(client);

      const page = ListSessionsResultSchema.parse(
        await client.request("listSessions", { channel: ROOT, limit }),
      );

      expect(Array.isArray(page.items)).toBe(true);
      const { nextCursor } = page;

      if (!nextCursor) {
        return;
      }

      expect(nextCursor).toEqual(expect.any(String));
    },
  );

  test("gives each listed session a URI, provider, and title", async ({
    client,
  }) => {
    await initialized(client);

    const page = ListSessionsResultSchema.parse(
      await client.request("listSessions", { channel: ROOT, limit: 10 }),
    );

    for (const item of page.items) {
      expect(item.resource.startsWith("ahp-session:/")).toBe(true);
      expect(item.provider.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  test("follows an advertised catalogue cursor", async ({ client }) => {
    await initialized(client);

    const first = ListSessionsResultSchema.parse(
      await client.request("listSessions", { channel: ROOT, limit: 1 }),
    );

    if (!first.nextCursor) {
      return;
    }

    const second = ListSessionsResultSchema.parse(
      await client.request("listSessions", {
        channel: ROOT,
        limit: 1,
        cursor: first.nextCursor,
      }),
    );

    expect(Array.isArray(second.items)).toBe(true);
  });
});
