import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { SessionSummary as AHPSessionSummary } from "@microsoft/agent-host-protocol";

export const hostTable = sqliteTable("host", {
  id: text().primaryKey(),
  serverSeq: integer().notNull().default(0),
});

export type HostEntry = typeof hostTable.$inferSelect;

export const sessionsTable = sqliteTable("sessions", {
  id: text().primaryKey(),
  defaultChatId: text().notNull().unique(),
  summary: text({ mode: "json" }).$type<AHPSessionSummary>().notNull(),
});

export type SessionEntry = typeof sessionsTable.$inferSelect;
