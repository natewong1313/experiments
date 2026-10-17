import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
} from "@microsoft/agent-host-protocol";

export const sessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  hostId: text().notNull(),
  acpSessionId: text(),
  // The absolute path that the ACP session runs in.
  cwd: text().notNull(),
  createdAt: text().notNull(),
  sessionState: text({ mode: "json" }).$type<AHPSessionState>().notNull(),
  // TODO: create chats table
  chatState: text({ mode: "json" }).$type<AHPChatState>().notNull(),
  revision: integer().notNull().default(0),
});

export type SessionRecord = typeof sessionTable.$inferSelect;

// The router subscriptions of this session. `RouterFanout` uses these tables.
export { subscriberChannelsTable, subscriberRoutersTable } from "../../shared/db/fanout-schema";
