import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SessionSummary } from "@experiments/protocol-schemas/ahp";

// Holds exactly one row, seeded by the migration that creates it.
export const hostTable = sqliteTable("host", {
  serverSeq: integer().notNull(),
});

export const sessionsTable = sqliteTable("sessions", {
  id: text().primaryKey(),
  defaultChatId: text().notNull().unique(),
  summary: text({ mode: "json" }).$type<SessionSummary>().notNull(),
});

export type SessionEntry = typeof sessionsTable.$inferSelect;
