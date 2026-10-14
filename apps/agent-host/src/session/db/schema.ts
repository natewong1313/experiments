import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
  SessionSummary as AHPSessionSummary,
} from "@microsoft/agent-host-protocol";

export const sessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  hostId: text().notNull(),
  acpSessionId: text(),
  sessionState: text({ mode: "json" }).$type<AHPSessionState>().notNull(),
  // TODO: create chats table
  chatState: text({ mode: "json" }).$type<AHPChatState>().notNull(),
  summary: text({ mode: "json" }).$type<AHPSessionSummary>().notNull(),
  revision: integer().notNull().default(0),
});

export type SessionRecord = typeof sessionTable.$inferSelect;

export type SessionRecordInsert = typeof sessionTable.$inferInsert;
