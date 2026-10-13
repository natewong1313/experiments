import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ChatState, SessionState } from "@microsoft/agent-host-protocol";
import type { SessionSummaryData } from "../../types";

export const sessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  hostId: text().notNull(),
  acpSessionId: text(),
  sessionState: text({ mode: "json" }).$type<SessionState>().notNull(),
  chatState: text({ mode: "json" }).$type<ChatState>().notNull(),
  summary: text({ mode: "json" }).$type<SessionSummaryData>().notNull(),
  revision: integer().notNull().default(0),
});

export type SessionRecord = typeof sessionTable.$inferSelect;

export type SessionRecordInsert = typeof sessionTable.$inferInsert;
