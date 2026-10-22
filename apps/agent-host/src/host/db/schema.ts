import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SessionSummary as AHPSessionSummary } from "@experiments/protocol-schemas/ahp";

// Holds at most one row, with ID 1, created by the first root change.
export const rootTable = sqliteTable(
  "root",
  {
    id: integer().primaryKey(),
    revision: integer().notNull(),
  },
  (table) => [check("root_singleton", sql`${table.id} = 1`)],
);

// The router subscriptions of the root channel. `RouterFanout` uses these tables.
export {
  closedRoutersTable,
  subscriberChannelsTable,
  subscriberCheckTable,
  subscriberRoutersTable,
} from "../../shared/db/fanout-schema";

export const sessionsTable = sqliteTable("sessions", {
  id: text().primaryKey(),
  // A session that reuses the ID of a disposed session has a new default chat URI.
  defaultChat: text().notNull(),
  summary: text({ mode: "json" }).$type<AHPSessionSummary>().notNull(),
  // The last session revision that changed the summary.
  revision: integer().notNull().default(0),
});

export type SessionEntry = typeof sessionsTable.$inferSelect;
