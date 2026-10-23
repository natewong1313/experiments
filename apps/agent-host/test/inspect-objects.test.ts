import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { SessionStateSchema } from "@experiments/protocol-schemas/ahp";
import type { SessionRPC } from "../src";
import { EVICTION_REASON } from "../examples/web/src/host/debug-eviction";
import { sessionDOName, sessionUri } from "../src/shared/lookups";
import { failureMessage } from "./fixtures";
import { storedTables } from "./storage";

it("inspects an absent session without creating storage", async () => {
  const name = sessionDOName(crypto.randomUUID(), crypto.randomUUID());
  const stub = env.CONVERSATIONS.getByName(name);

  expect(await stub.inspectObjects()).toEqual({ exists: false, routers: [] });
  expect(await storedTables(stub)).toEqual([]);
});

it("groups recorded router subscriptions and preserves them across eviction", async () => {
  const hostId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const name = sessionDOName(hostId, sessionId);
  const stub = env.CONVERSATIONS.getByName(name);
  const rpc: SessionRPC = stub;
  const channel = sessionUri(sessionId);
  const first = `${hostId}/a`;
  const second = `${hostId}/b`;
  await stub.create({ channel, provider: "test" });

  try {
    const snapshot = await rpc.subscribe({ router: first, channel });

    const chat = SessionStateSchema.parse(snapshot.state).defaultChat;

    if (chat === undefined) {
      throw new Error("Missing default chat");
    }

    await rpc.subscribe({ router: first, channel: chat });
    await rpc.subscribe({ router: second, channel });

    const expected = {
      exists: true,
      routers: [
        {
          name: first,
          channels: [chat, channel].toSorted((left, right) => left.localeCompare(right)),
        },
        { name: second, channels: [channel] },
      ],
    };

    expect(await stub.inspectObjects()).toEqual(expected);
    const eviction = await failureMessage(stub.evict());

    expect(eviction).toBe(EVICTION_REASON);

    const restarted = env.CONVERSATIONS.getByName(name);
    expect(await restarted.inspectObjects()).toEqual(expected);
    await restarted.unsubscribe({ router: first, channels: [chat, channel] });
    expect(await restarted.inspectObjects()).toEqual({
      exists: true,
      routers: [{ name: second, channels: [channel] }],
    });
  } finally {
    await env.CONVERSATIONS.getByName(name).dispose();
  }
});
