import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * The routers that subscribe to a sender, and the last revision each received. The host and
 * each session store these tables in their own database.
 */
export const subscriberRoutersTable = sqliteTable("subscriber_routers", {
  router: text().primaryKey(),
  deliveredRevision: integer().notNull(),
});

/**
 * The channels that each router subscribes to. Each subscription gets a new ID. This lets a
 * push reply remove only the subscriptions that existed when the sender sent the push.
 */
export const subscriberChannelsTable = sqliteTable(
  "subscriber_channels",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    router: text().notNull(),
    channel: text().notNull(),
  },
  (table) => [uniqueIndex("subscriber_channels_router_channel").on(table.router, table.channel)],
);

/**
 * Records closed routers so the sender rejects subscribe requests sent before the close but
 * received after it. A closed router never reopens. `closedAt` is the time the sender first
 * records the close, in milliseconds. A close or subscriber check deletes expired records.
 */
export const closedRoutersTable = sqliteTable(
  "closed_routers",
  {
    router: text().primaryKey(),
    closedAt: integer().notNull(),
  },
  (table) => [index("closed_routers_closed_at").on(table.closedAt)],
);

/**
 * Stores a singleton row with ID 1 after the sender schedules `checkSubscribers`. The row
 * survives restarts and prevents a new schedule from postponing a check that is due.
 */
export const subscriberCheckTable = sqliteTable(
  "subscriber_check",
  {
    id: integer().primaryKey(),
  },
  (table) => [check("subscriber_check_singleton", sql`${table.id} = 1`)],
);
