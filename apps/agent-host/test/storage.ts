import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { runInDurableObject } from "cloudflare:test";
import { expect, vi } from "vitest";
import type { SessionSubscribeResponse } from "../src/shared/rpc/session";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import { RouterDatabase } from "../src/router/db/database";
import { sendersTable, subscriptionSetupTable } from "../src/router/db/schema";
import { senderFromKey } from "../src/router/sender";
import type { Sender } from "../src/router/sender";
import { subscriberChannelsTable, subscriberRoutersTable } from "../src/shared/db/fanout-schema";
import { sessionUri } from "../src/shared/lookups";
import type { AgentSession } from "./session";

/**
 * The wake-up alarm of a router fires two seconds after the close, and again two seconds after
 * each wake-up that finds pending work.
 */
const ROUTER_CLEANUP_TIMEOUT_MS = 8000;

const TABLES = sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%'`;

/** Returns the tables that a Durable Object stored, without the runtime's internal tables. */
export async function storedTables(stub: DurableObjectStub): Promise<string[]> {
  const rows = await runInDurableObject(stub, (_instance, ctx) =>
    drizzle(ctx.storage).all<{ name: string }>(TABLES),
  );

  return rows.map((row) => row.name);
}

/**
 * Waits until the router deletes its storage. The test does not run the alarm early: an early
 * alarm finds the wake-up still pending and schedules it again.
 */
export async function waitForRouterCleanup(stub: DurableObjectStub): Promise<void> {
  await vi.waitFor(
    async () => {
      expect(await storedTables(stub)).toEqual([]);
    },
    { timeout: ROUTER_CLEANUP_TIMEOUT_MS },
  );
}

/** Returns the routers that subscribe to a host or a session. */
export async function subscribedRouters(stub: DurableObjectStub): Promise<string[]> {
  const rows = await runInDurableObject(stub, (_instance, ctx) => {
    const orm = drizzle(ctx.storage);
    const tables = orm.all(sql`SELECT name FROM sqlite_master WHERE name = 'subscriber_routers'`);

    return tables.length > 0 ? orm.select().from(subscriberRoutersTable).all() : [];
  });

  return rows.map((row) => row.router);
}

/** Returns the channels that routers subscribe to at a host or a session. */
export async function subscribedChannels(stub: DurableObjectStub): Promise<string[]> {
  const rows = await runInDurableObject(stub, (_instance, ctx) => {
    const orm = drizzle(ctx.storage);
    const tables = orm.all(sql`SELECT name FROM sqlite_master WHERE name = 'subscriber_channels'`);

    return tables.length > 0 ? orm.select().from(subscriberChannelsTable).all() : [];
  });

  return rows.map((row) => row.channel);
}

/** Returns the senders that a router receives pushes from. */
export async function routerSenders(stub: DurableObjectStub): Promise<Sender[]> {
  const rows = await runInDurableObject(stub, (_instance, ctx) => {
    const db = new RouterDatabase(ctx.storage);

    return db.hasMigrated() ? db.orm.select().from(sendersTable).all() : [];
  });

  return rows.map((row) => senderFromKey(row.id));
}

/** Records an unfinished subscription setup, as if a restart interrupted it. */
export async function storeSubscriptionSetup(stub: DurableObjectStub): Promise<void> {
  await runInDurableObject(stub, (_instance, ctx) => {
    new RouterDatabase(ctx.storage).orm.insert(subscriptionSetupTable).values({ id: 1 }).run();
  });
}

/** Returns the state and revision of a session channel without subscribing. */
export async function readState(
  stub: DurableObjectStub<AgentSession>,
  channel: string,
): Promise<SessionSubscribeResponse | undefined> {
  return await runInDurableObject(stub, (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);
    const record = db.hasMigrated() ? db.orm.select().from(sessionTable).get() : undefined;

    if (!record) {
      return;
    }

    const state = channel === sessionUri(record.id) ? record.sessionState : record.chatState;

    return { revision: record.revision, state };
  });
}
