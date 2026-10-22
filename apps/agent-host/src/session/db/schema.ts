import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
} from "@microsoft/agent-host-protocol";

export const sessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  acpSessionId: text(),
  // The absolute path that the ACP session runs in.
  cwd: text().notNull(),
  createdAt: text().notNull(),
  sessionState: text({ mode: "json" }).$type<AHPSessionState>().notNull(),
  // TODO: create chats table
  chatState: text({ mode: "json" }).$type<AHPChatState>().notNull(),
  revision: integer().notNull().default(0),
  // The host has the summary of this revision.
  // The session saves a change before it schedules the sync.
  // Thus a restart sends the summary again when `revision` is newer.
  syncedRevision: integer().notNull().default(0),
  // The `finishCreate` attempts of this creation. A restart does not reset the count.
  creationAttempts: integer().notNull().default(0),
  // True after a dispose commits. The only next step for a disposing session is deletion.
  disposing: integer({ mode: "boolean" }).notNull().default(false),
});

export type SessionRecord = typeof sessionTable.$inferSelect;

// The router subscriptions of this session. `RouterFanout` uses these tables.
export {
  closedRoutersTable,
  subscriberChannelsTable,
  subscriberCheckTable,
  subscriberRoutersTable,
} from "../../shared/db/fanout-schema";
