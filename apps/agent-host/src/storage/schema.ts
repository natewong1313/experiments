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
  id: integer().primaryKey(),
  seq: integer().notNull(),
  root: text({ mode: "json" }).$type<RootState>().notNull(),
  replayFloor: integer().notNull(),
  replayBytes: integer().notNull().default(0),
});

const sessions = sqliteTable(
  "sessions",
  {
    uri: text().primaryKey(),
    chatUri: text().notNull(),
    sessionKey: text("container").notNull(),
    acpSession: text(),
    createdAt: text().notNull(),
    modifiedAt: text().notNull(),
    session: text({ mode: "json" }).$type<SessionState>().notNull(),
  },
  (table) => [uniqueIndex("sessions_chat_uri_unique").on(table.chatUri)],
);

const actions = sqliteTable("actions", {
  seq: integer().primaryKey(),
  bytes: integer().notNull().default(0),
  envelope: text({ mode: "json" }).$type<ActionEnvelope>().notNull(),
});

const dispatches = sqliteTable(
  "dispatches",
  {
    clientId: text().notNull(),
    clientSeq: integer().notNull(),
    frame: text().notNull(),
    envelope: text({ mode: "json" }).$type<ActionEnvelope>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.clientId, table.clientSeq] })],
);

const turns = sqliteTable(
  "turns",
  {
    chatUri: text().notNull(),
    turnId: text().notNull(),
    ordinal: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatUri, table.turnId] }),
    uniqueIndex("turns_chat_uri_ordinal_unique").on(table.chatUri, table.ordinal),
  ],
);

const chats = sqliteTable("chats", {
  uri: text().primaryKey(),
  metadata: text().notNull(),
  activeTurn: text(),
  contentBytes: integer().notNull().default(0),
});

const turnRecords = sqliteTable(
  "turn_records",
  {
    chatUri: text().notNull(),
    turnId: text().notNull(),
    metadata: text().notNull(),
    bytes: integer().notNull(),
    partCount: integer().notNull(),
    blockingCount: integer().notNull(),
    inputCount: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatUri, table.turnId] })],
);

const replyParts = sqliteTable(
  "reply_parts",
  {
    chatUri: text().notNull(),
    turnId: text().notNull(),
    position: integer().notNull(),
    identity: text(),
    kind: text().notNull(),
    status: text(),
    metadata: text().notNull(),
    bytes: integer().notNull(),
    pieces: integer().notNull(),
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
    chatUri: text().notNull(),
    turnId: text().notNull(),
    position: integer().notNull(),
    piece: integer().notNull(),
    text: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatUri, table.turnId, table.position, table.piece] })],
);

const contents = sqliteTable(
  "contents",
  {
    uri: text().primaryKey(),
    chatUri: text().notNull(),
    contentType: text().notNull(),
    encoding: text({ enum: ["utf-8", "base64"] }).notNull(),
    bytes: integer().notNull(),
    retiredSeq: integer(),
  },
  (table) => [index("contents_retired").on(table.retiredSeq)],
);

const contentPieces = sqliteTable(
  "content_pieces",
  {
    uri: text().notNull(),
    piece: integer().notNull(),
    data: text().notNull(),
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
