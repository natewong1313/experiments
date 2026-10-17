import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
