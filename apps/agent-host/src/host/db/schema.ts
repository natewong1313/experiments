import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SessionSummary as AHPSessionSummary } from "@experiments/protocol-schemas/ahp";

// Holds at most one row, with ID 1, created by the first sequence allocation.
export const hostTable = sqliteTable(
  "host",
  {
    id: integer().primaryKey(),
    serverSeq: integer().notNull(),
  },
  (table) => [check("host_singleton", sql`${table.id} = 1`)],
);

export const sessionsTable = sqliteTable("sessions", {
  id: text().primaryKey(),
  defaultChatId: text().notNull().unique(),
  summary: text({ mode: "json" }).$type<AHPSessionSummary>().notNull(),
  revision: integer().notNull().default(0),
});

export type SessionEntry = typeof sessionsTable.$inferSelect;

export type SessionEntryInsert = typeof sessionsTable.$inferInsert;
