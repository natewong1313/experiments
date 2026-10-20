import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { RouterDatabase } from "../src/router/db/database";
import { SubscriptionStore } from "../src/router/dependencies/subscription-store";
import { SessionDatabase } from "../src/session/db/database";
import { subscriberChannelsTable } from "../src/shared/db/fanout-schema";
import { RouterFanout } from "../src/shared/fanout";
import type { FanoutSender } from "../src/shared/fanout";
import { newRouterDOName, sessionDOName } from "../src/shared/lookups";
import { HOST_SENDER, sessionSender } from "../src/router/sender";
import { ROOT_CHANNEL } from "../src/shared/protocol";

type Item = { revision: number };

const OLD_REVISION = 50;
const NEW_REVISION = 2;
const CHAT_REVISION = 10;
const SESSION_REVISION = 9;

/** Creates a fanout over migrated session storage, with a fake sender. */
async function fanout(
  ctx: DurableObjectState,
  send: FanoutSender<Item>["send"],
): Promise<RouterFanout<Item>> {
  const database = new SessionDatabase(ctx.storage);
  await database.migrate();

  return new RouterFanout<Item>({
    database,
    router: (name) => env.CONNECTIONS.getByName(name),
    sender: { send, gap: async () => await Promise.resolve([]) },
    scheduleFlush: async () => {
      await Promise.resolve();
    },
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
