import {
  blob,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type {
  ActionEnvelope,
  RootState,
  SessionState,
} from "@experiments/protocol-schemas/ahp";

const host = sqliteTable("host", {
  id: integer("id").primaryKey(),
  seq: integer("seq").notNull(),
  root: text("root", { mode: "json" }).$type<RootState>().notNull(),
  replayFloor: integer("replay_floor").notNull(),
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
  envelope: text("envelope", { mode: "json" })
    .$type<ActionEnvelope>()
    .notNull(),
});

const dispatches = sqliteTable(
  "dispatches",
  {
    clientId: text("client_id").notNull(),
    clientSeq: integer("client_seq").notNull(),
    frame: text("frame").notNull(),
    envelope: text("envelope", { mode: "json" })
      .$type<ActionEnvelope>()
      .notNull(),
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
    uniqueIndex("turns_chat_uri_ordinal_unique").on(
      table.chatUri,
      table.ordinal,
    ),
  ],
);

// Chunked BLOB storage for turn documents.
// Accessed through JsonDocuments on raw storage.sql.
// Chunk-diff writes are storage-engine logic, not relational queries.
const documentChunks = sqliteTable(
  "document_chunks",
  {
    scope: text("scope").notNull(),
    id: text("id").notNull(),
    chunk: integer("chunk").notNull(),
    data: blob("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.id, table.chunk] })],
);

export { documentChunks, host, sessions, actions, dispatches, turns };
