import { and, asc, eq, max } from "drizzle-orm";
import { turns } from "./schema";
import type { JsonDocuments } from "./json-documents";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import type { ChatState, Turn } from "@experiments/protocol-schemas/ahp";

const INITIAL_ORDINAL = -1;
type Database = ReturnType<typeof drizzle>;

class ChatStore {
  private readonly db: Database;
  private readonly documents: JsonDocuments;

  constructor(db: Database, documents: JsonDocuments) {
    this.db = db;
    this.documents = documents;
  }

  live(uri: string): ChatState {
    return this.documents.read<ChatState>("chat", uri);
  }

  snapshot(uri: string): ChatState {
    const chat = this.live(uri);
    const rows = this.db
      .select({ turnId: turns.turnId })
      .from(turns)
      .where(eq(turns.chatUri, uri))
      .orderBy(asc(turns.ordinal))
      .all();
    const history = rows.map((row) => this.readTurn(uri, row.turnId));
    return { ...chat, turns: history };
  }

  hasTurn(uri: string, turnId: string): boolean {
    const match = and(eq(turns.chatUri, uri), eq(turns.turnId, turnId));
    const row = this.db
      .select({ turnId: turns.turnId })
      .from(turns)
      .where(match)
      .get();
    return row !== void 0;
  }

  // Live chat state carries only new turns.
  // Stored turns are appended in the order they first appear.
  // Callers run inside a transactionSync block.
  save(uri: string, chat: ChatState): void {
    const highest = this.db
      .select({ ordinal: max(turns.ordinal) })
      .from(turns)
      .where(eq(turns.chatUri, uri))
      .get();
    let ordinal = highest?.ordinal ?? INITIAL_ORDINAL;
    for (const turn of chat.turns) {
      ordinal += 1;
      this.db
        .insert(turns)
        .values({ chatUri: uri, turnId: turn.id, ordinal })
        .run();
      this.documents.write(uri, turn.id, turn);
    }
    this.documents.write("chat", uri, { ...chat, turns: [] });
  }

  remove(uri: string): void {
    this.db.delete(turns).where(eq(turns.chatUri, uri)).run();
    this.documents.remove("chat", uri);
    this.documents.removeScope(uri);
  }

  private readTurn(uri: string, turnId: string): Turn {
    return this.documents.read<Turn>(uri, turnId);
  }
}

export { ChatStore };
