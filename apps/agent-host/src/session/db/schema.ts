import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  ChatState as AHPChatState,
  ChatSummary as AHPChatSummary,
  Message as AHPMessage,
  ResponsePart as AHPResponsePart,
  SessionState as AHPSessionState,
  TurnState as AHPTurnState,
  UsageInfo as AHPUsageInfo,
} from "@microsoft/agent-host-protocol";

/**
 * The session state without its chat summaries. A read adds the summaries from the chats
 * table.
 */
export type StoredSessionState = Omit<AHPSessionState, "chats" | "defaultChat"> & {
  defaultChat: string;
};

/** The chat fields that are neither summary fields nor conversation contents. */
export type ChatMetadata = Omit<
  AHPChatState,
  keyof AHPChatSummary | "turns" | "activeTurn" | "turnsNextCursor"
>;

/** The state of a stored turn. An active turn ends with one of the AHP turn states. */
export type StoredTurnState = AHPTurnState | "active";

export const sessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  acpSessionId: text(),
  // The absolute path that the ACP session runs in.
  cwd: text().notNull(),
  createdAt: text().notNull(),
  sessionState: text({ mode: "json" }).$type<StoredSessionState>().notNull(),
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

export const chatsTable = sqliteTable("chats", {
  resource: text().primaryKey(),
  // The session state reads its chat summaries from these rows.
  summary: text({ mode: "json" }).$type<AHPChatSummary>().notNull(),
  metadata: text({ mode: "json" }).$type<ChatMetadata>().notNull(),
  // The row ID of the active turn.
  activeTurn: integer(),
  // All subscribers of the chat share one window of loaded history.
  // A null ID means that no window exists. A window also ends when the chat has no subscribers.
  windowId: text(),
  // The window holds the turns at this position and after it.
  windowStart: integer().notNull().default(0),
});

export type ChatRecord = typeof chatsTable.$inferSelect;

export const turnsTable = sqliteTable(
  "turns",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    chat: text()
      .notNull()
      .references(() => chatsTable.resource, { onDelete: "cascade" }),
    // The AHP turn ID.
    turnId: text().notNull(),
    // The order of the turn in its chat. A later turn has a higher position.
    position: integer().notNull(),
    state: text().$type<StoredTurnState>().notNull(),
    startedAt: text(),
    duration: integer(),
    message: text({ mode: "json" }).$type<AHPMessage>().notNull(),
    usage: text({ mode: "json" }).$type<AHPUsageInfo>(),
  },
  (table) => [
    uniqueIndex("turns_chat_turn_id").on(table.chat, table.turnId),
    uniqueIndex("turns_chat_position").on(table.chat, table.position),
  ],
);

export type TurnRecord = typeof turnsTable.$inferSelect;

export const responsePartsTable = sqliteTable(
  "response_parts",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    turn: integer()
      .notNull()
      .references(() => turnsTable.id, { onDelete: "cascade" }),
    // The order of the part in its turn.
    position: integer().notNull(),
    kind: text().$type<AHPResponsePart["kind"]>().notNull(),
    // Actions address tool calls by tool call ID and markdown or reasoning parts by part ID.
    targetId: text(),
    // True for a tool call that is not complete or cancelled, and for an unanswered input request.
    pending: integer({ mode: "boolean" }).notNull(),
    // Text segments hold the streamed text. The payload retains only a trailing high surrogate from that text.
    payload: text({ mode: "json" }).$type<AHPResponsePart>().notNull(),
  },
  (table) => [
    uniqueIndex("response_parts_turn_position").on(table.turn, table.position),
    index("response_parts_turn_target").on(table.turn, table.targetId, table.position),
    index("response_parts_turn_pending").on(table.turn, table.pending, table.position),
  ],
);

export type ResponsePartRecord = typeof responsePartsTable.$inferSelect;

// The streamed text of each response part, in segments of at most `SEGMENT_BYTES` UTF-8 bytes.
export const textSegmentsTable = sqliteTable(
  "text_segments",
  {
    part: integer()
      .notNull()
      .references(() => responsePartsTable.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    text: text().notNull(),
    bytes: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.part, table.position] })],
);

// The router subscriptions of this session. `RouterFanout` uses these tables.
export {
  closedRoutersTable,
  subscriberChannelsTable,
  subscriberCheckTable,
  subscriberRoutersTable,
} from "../../shared/db/fanout-schema";
