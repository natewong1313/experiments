import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Holds at most one row, with ID 1, created by the first sequence allocation.
export const connectionTable = sqliteTable(
  "connection",
  {
    id: integer().primaryKey(),
    serverSeq: integer().notNull(),
  },
  (table) => [check("connection_singleton", sql`${table.id} = 1`)],
);

/**
 * The senders that push updates to this router. A sender is the host or one session. `id` is
 * the sender key from `senderKey`. `revision` is the last revision that the router received from
 * the sender.
 */
export const sendersTable = sqliteTable("senders", {
  id: text().primaryKey(),
  revision: integer().notNull(),
});

/**
 * The channels that the client subscribes to. `sender` is the sender key from `senderKey`.
 * `revision` is the sender revision of the snapshot that the client received. The router skips
 * actions that the snapshot already contains.
 */
export const subscriptionsTable = sqliteTable("subscriptions", {
  channel: text().primaryKey(),
  sender: text().notNull(),
  revision: integer().notNull(),
});

/**
 * Holds one row, with ID 1, while a subscription setup holds pushes in memory. A row that
 * remains after a restart shows that the router lost held pushes.
 */
export const subscriptionSetupTable = sqliteTable(
  "subscription_setup",
  {
    id: integer().primaryKey(),
  },
  (table) => [check("subscription_setup_singleton", sql`${table.id} = 1`)],
);
