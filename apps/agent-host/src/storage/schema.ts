import {
  integer,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ActionEnvelope, RootState, SessionState } from "@experiments/protocol-schemas/ahp";

const host = sqliteTable("host", {
  id: integer("id").primaryKey(),
  seq: integer("seq").notNull(),
  root: text("root", { mode: "json" }).$type<RootState>().notNull(),
  replayFloor: integer("replay_floor").notNull(),
  replayBytes: integer("replay_bytes").notNull().default(0),
});

const sessions = sqliteTable("sessions", {
  uri: text("uri").primaryKey(),
  chatUri: text("chat_uri").notNull().unique(),
  sessionKey: text("container").notNull(),
  acpSession: text("acp_session"),
  createdAt: text("created_at").notNull(),
  modifiedAt: text("modified_at").notNull(),
  session: text("session", { mode: "json" }).$type<SessionState>().notNull(),
});

const actions = sqliteTable("actions", {
  seq: integer("seq").primaryKey(),
  bytes: integer("bytes").notNull().default(0),
  envelope: text("envelope", { mode: "json" }).$type<ActionEnvelope>().notNull(),
});

const dispatches = sqliteTable(
  "dispatches",
  {
    clientId: text("client_id").notNull(),
    clientSeq: integer("client_seq").notNull(),
    frame: text("frame").notNull(),
    envelope: text("envelope", { mode: "json" }).$type<ActionEnvelope>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.clientId, table.clientSeq] })],
);

const turns = sqliteTable(
  "turns",
  {
    chatUri: text("chat_uri").notNull(),
    turnId: text("turn_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatUri, table.turnId] }),
    uniqueIndex("turns_chat_uri_ordinal_unique").on(table.chatUri, table.ordinal),
  ],
);

const chats = sqliteTable("chats", {
  uri: text("uri").primaryKey(),
  metadata: text("metadata").notNull(),
  activeTurn: text("active_turn"),
  contentBytes: integer("content_bytes").notNull().default(0),
});

const turnRecords = sqliteTable(
  "turn_records",
  {
    chatUri: text("chat_uri").notNull(),
    turnId: text("turn_id").notNull(),
    metadata: text("metadata").notNull(),
    bytes: integer("bytes").notNull(),
    partCount: integer("part_count").notNull(),
    blockingCount: integer("blocking_count").notNull(),
    inputCount: integer("input_count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatUri, table.turnId] })],
);

const replyParts = sqliteTable(
  "reply_parts",
  {
    chatUri: text("chat_uri").notNull(),
    turnId: text("turn_id").notNull(),
    position: integer("position").notNull(),
    identity: text("identity"),
    kind: text("kind").notNull(),
    status: text("status"),
    metadata: text("metadata").notNull(),
    bytes: integer("bytes").notNull(),
    pieces: integer("pieces").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatUri, table.turnId, table.position] }),
    index("reply_parts_identity").on(table.chatUri, table.turnId, table.identity, table.position),
    index("reply_parts_status").on(table.chatUri, table.turnId, table.kind, table.status),
  ],
);

const textPieces = sqliteTable(
  "text_pieces",
  {
    chatUri: text("chat_uri").notNull(),
    turnId: text("turn_id").notNull(),
    position: integer("position").notNull(),
    piece: integer("piece").notNull(),
    text: text("text").notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatUri, table.turnId, table.position, table.piece] })],
);

const contents = sqliteTable(
  "contents",
  {
    uri: text("uri").primaryKey(),
    chatUri: text("chat_uri").notNull(),
    contentType: text("content_type").notNull(),
    encoding: text("encoding").notNull(),
    bytes: integer("bytes").notNull(),
    retiredSeq: integer("retired_seq"),
  },
  (table) => [index("contents_retired").on(table.retiredSeq)],
);

const contentPieces = sqliteTable(
  "content_pieces",
  {
    uri: text("uri").notNull(),
    piece: integer("piece").notNull(),
    data: text("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.uri, table.piece] })],
);

export {
  host,
  sessions,
  actions,
  dispatches,
  turns,
  chats,
  turnRecords,
  replyParts,
  textPieces,
  contents,
  contentPieces,
};
