import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { RouterDatabase } from "../src/router/db/database";
import { SubscriptionStore } from "../src/router/dependencies/subscription-store";
import { SessionDatabase } from "../src/session/db/database";
import { closedRoutersTable, subscriberChannelsTable } from "../src/shared/db/fanout-schema";
import { CHECK_INTERVAL_MS, CLOSED_ROUTER_TTL_MS, RouterFanout } from "../src/shared/fanout";
import type { FanoutSender } from "../src/shared/fanout";
import { newRouterDOName, sessionDOName } from "../src/shared/lookups";
import { HOST_SENDER, sessionSender } from "../src/router/sender";
import { ROOT_CHANNEL } from "../src/shared/protocol";

type Item = { revision: number };

const OLD_REVISION = 50;
const NEW_REVISION = 2;
const CHAT_REVISION = 10;
const SESSION_REVISION = 9;

type Gap = (router: string) => Promise<string[]>;

type ScheduleCheck = (time: number) => Promise<void>;

type FanoutOverrides = { gap?: Gap; scheduleCheck?: ScheduleCheck };

async function noop(): Promise<void> {
  await Promise.resolve();
}

async function noChannels(): Promise<string[]> {
  return await Promise.resolve([]);
}

/** Creates a fanout over migrated session storage, with a fake sender. */
async function fanout(
  ctx: DurableObjectState,
  send: FanoutSender<Item>["send"],
  overrides: FanoutOverrides = {},
): Promise<RouterFanout<Item>> {
  const database = new SessionDatabase(ctx.storage);
  await database.migrate();
  const { gap = noChannels, scheduleCheck = noop } = overrides;
  // The fake gap handler identifies routers by name rather than by stub.
  const names: Map<object, string> = new Map();

  return new RouterFanout<Item>({
    database,
    router: (name) => {
      const stub = env.CONNECTIONS.getByName(name);
      names.set(stub, name);

      return stub;
    },
    sender: { send, gap: async (stub) => await gap(names.get(stub) ?? "") },
    scheduleFlush: noop,
    scheduleCheck,
  });
}

function sessionStub(): ReturnType<typeof env.CONVERSATIONS.getByName> {
  const name = sessionDOName(crypto.randomUUID(), crypto.randomUUID());

  return env.CONVERSATIONS.getByName(name);
}

/** Creates a subscription store over migrated router storage. */
async function subscriptionStore(ctx: DurableObjectState): Promise<SubscriptionStore> {
  const db = new RouterDatabase(ctx.storage);
  await db.migrate();

  return new SubscriptionStore(db);
}

function routerStub(): ReturnType<typeof env.CONNECTIONS.getByName> {
  const name = newRouterDOName(crypto.randomUUID());

  return env.CONNECTIONS.getByName(name);
}

it("keeps a subscription that a router makes while a push is in flight", async () => {
  const router = newRouterDOName(crypto.randomUUID());
  const reply = Promise.withResolvers<string[]>();
  const sent = Promise.withResolvers<null>();

  const channels = await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    const pushes = await fanout(ctx, async () => {
      sent.resolve(null);

      return await reply.promise;
    });

    pushes.subscribe(router, "first", 0);
    await pushes.publish([{ revision: 1 }]);
    await sent.promise;
    pushes.subscribe(router, "second", 1);
    // The router replied before it recorded the second channel.
    reply.resolve(["first"]);
    await pushes.idle();

    return drizzle(ctx.storage).select().from(subscriberChannelsTable).all();
  });

  expect(channels.map((row) => row.channel).toSorted()).toEqual(["first", "second"]);
});

it("keeps a router until it unsubscribes from its last channel", async () => {
  const router = newRouterDOName(crypto.randomUUID());

  const routers = await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    const pushes = await fanout(ctx, async () => await Promise.resolve([]));
    pushes.subscribe(router, "first", 0);
    pushes.subscribe(router, "second", 0);
    pushes.unsubscribe(router, ["first"]);
    const afterFirst = pushes.routers();
    pushes.unsubscribe(router, ["second"]);

    return { afterFirst, afterSecond: pushes.routers() };
  });

  expect(routers).toEqual({ afterFirst: [router], afterSecond: [] });
});

it("removes a router that cannot be reached", async () => {
  const router = newRouterDOName(crypto.randomUUID());

  const routers = await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    const pushes = await fanout(ctx, async () => {
      throw new Error("Router is unreachable");
    });

    pushes.subscribe(router, "first", 0);
    await pushes.publish([{ revision: 1 }]);
    await pushes.idle();

    return pushes.routers();
  });

  expect(routers).toEqual([]);
});

it("starts a new sender at the lowest snapshot revision of its channels", async () => {
  const stub = routerStub();

  const receipt = await runInDurableObject(stub, async (_instance, ctx) => {
    const channels = await subscriptionStore(ctx);
    channels.store({
      channel: "chat",
      sender: sessionSender("session"),
      revision: CHAT_REVISION,
    });
    channels.store({
      channel: "session",
      sender: sessionSender("session"),
      revision: SESSION_REVISION,
    });

    const items = [{ channel: "session" }, { channel: "chat" }];

    return channels.receive(sessionSender("session"), SESSION_REVISION, [
      { revision: CHAT_REVISION, items },
    ]);
  });

  // The chat snapshot already contains revision 10. The session snapshot does not.
  expect(receipt).toMatchObject({ kind: "accepted", items: [{ channel: "session" }] });
});

it("starts again when a sender with the same ID returns a lower snapshot revision", async () => {
  const stub = routerStub();

  const receipt = await runInDurableObject(stub, async (_instance, ctx) => {
    const channels = await subscriptionStore(ctx);
    channels.store({
      channel: "old",
      sender: sessionSender("session"),
      revision: OLD_REVISION,
    });
    channels.store({
      channel: "new",
      sender: sessionSender("session"),
      revision: NEW_REVISION,
    });

    const update = { revision: NEW_REVISION + 1, items: [{ channel: "new" }] };

    return channels.receive(sessionSender("session"), NEW_REVISION, [update]);
  });

  expect(receipt).toMatchObject({ kind: "accepted", items: [{ channel: "new" }] });
});

/** A push of revision 1 with one item for the channel. */
function firstRevision(channel: string): { revision: number; items: { channel: string }[] }[] {
  return [{ revision: 1, items: [{ channel }] }];
}

it("removes only the subscriptions of the removed sender", async () => {
  const stub = routerStub();
  const first = sessionSender("first");
  const second = sessionSender("second");

  const result = await runInDurableObject(stub, async (_instance, ctx) => {
    const channels = await subscriptionStore(ctx);
    channels.store({ channel: ROOT_CHANNEL, sender: HOST_SENDER, revision: 0 });
    channels.store({ channel: "first", sender: first, revision: 0 });
    channels.store({ channel: "second", sender: second, revision: 0 });
    channels.removeSender(first);

    return {
      host: channels.receive(HOST_SENDER, 0, firstRevision(ROOT_CHANNEL)),
      first: channels.receive(first, 0, firstRevision("first")),
      second: channels.receive(second, 0, firstRevision("second")),
      subscriptions: channels.subscriptions(),
    };
  });

  expect(result.host).toEqual({
    kind: "accepted",
    items: [{ channel: ROOT_CHANNEL }],
    subscribed: [ROOT_CHANNEL],
  });
  expect(result.first).toEqual({ kind: "unknown" });
  expect(result.second).toEqual({
    kind: "accepted",
    items: [{ channel: "second" }],
    subscribed: ["second"],
  });

  const remaining = result.subscriptions.toSorted((a, b) => a.channel.localeCompare(b.channel));

  expect(remaining).toEqual([
    { channel: ROOT_CHANNEL, sender: HOST_SENDER },
    { channel: "second", sender: second },
  ]);
});

it("removes the closed routers that a check finds, and keeps routers that fail the call", async () => {
  const live = newRouterDOName(crypto.randomUUID());
  const closed = newRouterDOName(crypto.randomUUID());
  const unreachable = newRouterDOName(crypto.randomUUID());
  const checks: number[] = [];

  const result = await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    const pushes = await fanout(ctx, async () => await Promise.resolve([]), {
      gap: async (router) => {
        if (router === unreachable) {
          throw new Error("Router is unreachable");
        }

        return await Promise.resolve(router === live ? ["first"] : []);
      },
      scheduleCheck: async (time) => {
        checks.push(time);
        await Promise.resolve();
      },
    });

    for (const router of [live, closed, unreachable]) {
      pushes.subscribe(router, "first", 0);
    }

    const start = Date.now();
    await pushes.check(0);

    return { start, routers: pushes.routers() };
  });

  expect(result.routers.toSorted()).toEqual([live, unreachable].toSorted());
  expect(checks).toHaveLength(1);
  expect(checks[0]).toBeGreaterThanOrEqual(result.start + CHECK_INTERVAL_MS);
});

it("does not replace a scheduled check after a restart", async () => {
  const checks: number[] = [];

  const scheduled = await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    async function scheduleCheck(time: number): Promise<void> {
      checks.push(time);
      await Promise.resolve();
    }

    const before = await fanout(ctx, async () => await Promise.resolve([]), { scheduleCheck });
    await before.scheduleCheck();

    const after = await fanout(ctx, async () => await Promise.resolve([]), { scheduleCheck });
    await after.scheduleCheck();
    const afterRestart = checks.length;
    // With no subscribed routers, the check clears its marker without scheduling another alarm.
    await after.check(0);
    await after.scheduleCheck();

    return { afterRestart, afterCheck: checks.length };
  });

  expect(scheduled).toEqual({ afterRestart: 1, afterCheck: 2 });
});

it("waits for a running check before the fanout is idle", async () => {
  const router = newRouterDOName(crypto.randomUUID());
  const reply = Promise.withResolvers<string[]>();
  const events: string[] = [];

  await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    const pushes = await fanout(ctx, async () => await Promise.resolve([]), {
      gap: async () => {
        const channels = await reply.promise;
        events.push("check");

        return channels;
      },
    });

    pushes.subscribe(router, "first", 0);
    const checking = pushes.check(0);

    const idle = (async (): Promise<void> => {
      await pushes.idle();
      events.push("idle");
    })();

    reply.resolve([]);
    await Promise.all([checking, idle]);
  });

  expect(events).toEqual(["check", "idle"]);
});

it("accepts a subscribe request from a closed router after the closed router expires", async () => {
  const expired = newRouterDOName(crypto.randomUUID());
  const recent = newRouterDOName(crypto.randomUUID());

  const result = await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    const pushes = await fanout(ctx, async () => await Promise.resolve([]));
    pushes.close(recent);
    const closedAt = Date.now() - CLOSED_ROUTER_TTL_MS - 1;
    new SessionDatabase(ctx.storage).orm
      .insert(closedRoutersTable)
      .values({ router: expired, closedAt })
      .run();
    // Expiry alone does not remove the record. Another close or subscriber check must delete it.
    const later = newRouterDOName(crypto.randomUUID());
    pushes.close(later);
    pushes.subscribe(expired, "first", 0);

    let rejection: string | undefined;

    try {
      pushes.subscribe(recent, "first", 0);
    } catch (error) {
      rejection = error instanceof Error ? error.message : String(error);
    }

    return { routers: pushes.routers(), rejection };
  });

  expect(result).toEqual({ routers: [expired], rejection: "Router is closed" });
});

it("waits for the acknowledgement of a revision and reports a failed push", async () => {
  const router = newRouterDOName(crypto.randomUUID());
  const replies: PromiseWithResolvers<string[]>[] = [];

  async function heldSend(): Promise<string[]> {
    const reply = Promise.withResolvers<string[]>();
    replies.push(reply);

    return await reply.promise;
  }

  const result = await runInDurableObject(sessionStub(), async (_instance, ctx) => {
    const pushes = await fanout(ctx, heldSend);
    pushes.subscribe(router, "chat", 0);
    await pushes.publish([{ revision: 1 }]);
    await pushes.publish([{ revision: NEW_REVISION }]);
    const states: string[] = [];
    const delivery = pushes.delivered(router, NEW_REVISION);
    void delivery.then(() => states.push("delivered"));

    // Acknowledging the first batch does not resolve a wait for the second revision.
    await vi.waitFor(() => {
      expect(replies).toHaveLength(1);
    });
    replies[0]?.resolve(["chat"]);
    await vi.waitFor(() => {
      expect(replies).toHaveLength(NEW_REVISION);
    });
    states.push("second batch sent");
    replies[1]?.resolve(["chat"]);
    const acknowledged = await delivery;

    // A failed push removes the router. The delivery wait returns false.
    await pushes.publish([{ revision: NEW_REVISION + 1 }]);
    const failed = pushes.delivered(router, NEW_REVISION + 1);
    await vi.waitFor(() => {
      expect(replies).toHaveLength(NEW_REVISION + 1);
    });
    replies[NEW_REVISION]?.reject(new Error("Router is unreachable"));

    return { states, acknowledged, failed: await failed, routers: pushes.routers() };
  });

  expect(result).toEqual({
    states: ["second batch sent", "delivered"],
    acknowledged: true,
    failed: false,
    routers: [],
  });
});
