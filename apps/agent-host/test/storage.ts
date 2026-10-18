import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { runInDurableObject } from "cloudflare:test";
import type { SessionSubscribeResponse } from "../src/shared/rpc/session";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import { RouterDatabase } from "../src/router/db/database";
import { sendersTable } from "../src/router/db/schema";
import { subscriberChannelsTable, subscriberRoutersTable } from "../src/shared/db/fanout-schema";
import { sessionUri } from "../src/shared/lookups";
import type { AgentSession } from "./session";

const TABLES = sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%'`;

/** Returns the tables that a Durable Object stored, without the runtime's internal tables. */
export async function storedTables(stub: DurableObjectStub): Promise<string[]> {
  const rows = await runInDurableObject(stub, (_instance, ctx) =>
    drizzle(ctx.storage).all<{ name: string }>(TABLES),
  );

  return rows.map((row) => row.name);
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
export async function routerSenders(stub: DurableObjectStub): Promise<string[]> {
  const rows = await runInDurableObject(stub, (_instance, ctx) => {
    const db = new RouterDatabase(ctx.storage);

    return db.hasMigrated() ? db.orm.select().from(sendersTable).all() : [];
  });

  return rows.map((row) => row.id);
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
