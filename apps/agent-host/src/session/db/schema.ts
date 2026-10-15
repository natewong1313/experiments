import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
} from "@microsoft/agent-host-protocol";
import type { HostSessionUpdateRequest } from "../../shared/rpc/host";

export const sessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  hostId: text().notNull(),
  acpSessionId: text(),
  // Absolute path the ACP session runs in.
  cwd: text().notNull(),
  createdAt: text().notNull(),
  sessionState: text({ mode: "json" }).$type<AHPSessionState>().notNull(),
  // TODO: create chats table
  chatState: text({ mode: "json" }).$type<AHPChatState>().notNull(),
  revision: integer().notNull().default(0),
});

export type SessionRecord = typeof sessionTable.$inferSelect;

export type SessionRecordInsert = typeof sessionTable.$inferInsert;

export const hostUpdatesTable = sqliteTable("host_updates", {
  id: integer().primaryKey({ autoIncrement: true }),
  hostId: text().notNull(),
  update: text({ mode: "json" }).$type<HostSessionUpdateRequest>().notNull(),
  attempts: integer().notNull().default(0),
  retryAt: integer(),
  error: text(),
});

export type PendingHostUpdate = typeof hostUpdatesTable.$inferSelect;
