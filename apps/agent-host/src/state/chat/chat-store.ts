import { and, eq, sql } from "drizzle-orm";
import { chatsTable, turnRecordsTable } from "../persistence/schema";
import {
  ChatStateSchema,
  ActiveTurnSchema,
  type ChatState,
} from "@experiments/protocol-schemas/ahp";
import { checkBytes } from "../../memory";
import { encodedSize } from "../persistence/encoding";
import type { Database } from "../persistence/database";
import type { TurnStore } from "./turn-store";

const MAX_CHAT_METADATA_BYTES = 65_536;

type ChatStoreParams = { db: Database; turns: TurnStore };

export class ChatStore {
  private readonly db: Database;
  private readonly turns: TurnStore;

  constructor({ db, turns }: ChatStoreParams) {
    this.db = db;
    this.turns = turns;
  }

  readMetadata(uri: string): ChatState {
    const row = this.db
      .select({ metadata: chatsTable.metadata, activeTurn: chatsTable.activeTurn })
      .from(chatsTable)
      .where(eq(chatsTable.uri, uri))
      .get();

    if (!row) {
      throw new Error("Chat does not exist");
    }

    const chat = ChatStateSchema.parse(JSON.parse(row.metadata));

    if (row.activeTurn === null) {
      return chat;
    }

    const turn = this.turns.readTurnRecord(uri, row.activeTurn);

    return { ...chat, activeTurn: ActiveTurnSchema.parse(JSON.parse(turn.metadata)) };
  }

  activeStateBytes(uri: string): number {
    const match = and(
      eq(turnRecordsTable.chatUri, chatsTable.uri),
      eq(turnRecordsTable.turnId, chatsTable.activeTurn),
    );

    return (
      this.db
        .select({
          bytes: sql<number>`LENGTH(CAST(${chatsTable.metadata} AS BLOB)) + COALESCE(${turnRecordsTable.bytes}, 0)`,
        })
        .from(chatsTable)
        .leftJoin(turnRecordsTable, match)
        .where(eq(chatsTable.uri, uri))
        .get()?.bytes ?? 0
    );
  }

  createChat(uri: string, chat: ChatState): void {
    if (chat.activeTurn || chat.turns.length) {
      throw new Error("Use record transitions to save turns");
    }

    this.db
      .insert(chatsTable)
      .values({ uri, metadata: JSON.stringify(chat) })
      .run();
  }

  writeChatMetadata(uri: string, chat: ChatState): void {
    const { activeTurn, ...metadata } = chat;
    const text = JSON.stringify(metadata);
    const bytes = encodedSize(metadata);

    checkBytes(bytes, MAX_CHAT_METADATA_BYTES, "Chat metadata exceeds the storage budget");

    const match = and(
      eq(chatsTable.uri, uri),
      sql`(${chatsTable.metadata} != ${text} OR ${chatsTable.activeTurn} IS NOT ${activeTurn?.id ?? null})`,
    );

    this.db
      .update(chatsTable)
      .set({ metadata: text, activeTurn: activeTurn?.id ?? null })
      .where(match)
      .run();
  }

  deleteChat(uri: string): void {
    this.db.delete(chatsTable).where(eq(chatsTable.uri, uri)).run();
  }
}
