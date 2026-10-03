import { and, eq, max } from "drizzle-orm";
import * as z from "zod";
import { turns } from "./schema";
import type { JsonDocuments } from "./json-documents";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import type { ChatState, Turn } from "@experiments/protocol-schemas/ahp";
import { ProtocolError, RpcCodes } from "../ahp/protocol";
import {
  MAX_DOCUMENT_BYTES,
  COMPLETION_RESERVE_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_HISTORY_PAGE_BYTES,
  RESPONSE_RESERVE_BYTES,
  checkBytes,
} from "../memory";

const INITIAL_ORDINAL = -1;

const HISTORY_PAGE_TURNS = 100;

const CursorSchema = z.object({
  channel: z.string(),
  before: z.int().nonnegative(),
});

type HistoryPage = Pick<ChatState, "turns" | "turnsNextCursor">;

type Database = ReturnType<typeof drizzle>;

class ChatStore {
  private readonly db: Database;
  private readonly documents: JsonDocuments;
  private readonly sql: SqlStorage;

  constructor(db: Database, documents: JsonDocuments, sql: SqlStorage) {
    this.db = db;
    this.documents = documents;
    this.sql = sql;
  }

  live(uri: string): ChatState {
    return this.documents.read<ChatState>("chat", uri);
  }

  liveSize(uri: string): number {
    return this.documents.size("chat", uri);
  }

  size(uri: string): number {
    return this.documents.size("chat", uri) + this.documents.size(uri);
  }

  snapshot(uri: string, count?: number): ChatState {
    const liveBytes = this.documents.size("chat", uri);
    const budget = MAX_SNAPSHOT_BYTES - liveBytes - RESPONSE_RESERVE_BYTES;

    if (count !== void 0) {
      return {
        ...this.live(uri),
        ...this.page(uri, Number.MAX_SAFE_INTEGER, count, budget),
      };
    }

    checkBytes(
      this.documents.size(uri),
      budget,
      "Snapshot exceeds the memory budget; subscribe with view.turns and use fetchTurns",
    );
    const history: Turn[] = [];

    for (const row of this.sql.exec<{ turn_id: string }>(
      "SELECT turn_id FROM turns WHERE chat_uri = ? ORDER BY ordinal",
      uri,
    )) {
      history.push(this.readTurn(uri, row.turn_id));
    }

    return { ...this.live(uri), turns: history };
  }

  fetchTurns(uri: string, cursor: string): HistoryPage {
    let value: unknown;

    try {
      value = JSON.parse(cursor);
    } catch {
      throw new ProtocolError(RpcCodes.params, "Invalid turn-history cursor");
    }

    const parsed = CursorSchema.safeParse(value);

    if (!parsed.success || parsed.data.channel !== uri) {
      throw new ProtocolError(RpcCodes.params, "Invalid turn-history cursor");
    }

    return this.page(
      uri,
      parsed.data.before,
      HISTORY_PAGE_TURNS,
      MAX_HISTORY_PAGE_BYTES,
    );
  }

  private page(
    uri: string,
    before: number,
    count: number,
    budget: number,
  ): HistoryPage {
    const limit = Math.min(count, HISTORY_PAGE_TURNS);
    const history: Turn[] = [];
    let remaining = budget;
    let boundary = before;
    let more = false;

    const rows = this.sql.exec<{
      turn_id: string;
      ordinal: number;
      bytes: number;
    }>(
      `SELECT turn_id, ordinal, (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM document_chunks WHERE scope = chat_uri AND id = turn_id) AS bytes
       FROM turns WHERE chat_uri = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT ?`,
      uri,
      before,
      limit + 1,
    );

    for (const row of rows) {
      if (history.length >= limit || row.bytes > remaining) {
        if (history.length === 0 && limit > 0) {
          checkBytes(
            row.bytes,
            remaining,
            "Turn exceeds the history page memory budget",
          );
        }

        more = true;
        break;
      }

      history.unshift(this.readTurn(uri, row.turn_id));
      remaining -= row.bytes;
      boundary = row.ordinal;
    }

    const page: HistoryPage = { turns: history };

    if (more) {
      page.turnsNextCursor = JSON.stringify({ channel: uri, before: boundary });
    }

    return page;
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

    this.documents.write(
      "chat",
      uri,
      { ...chat, turns: [] },
      chat.activeTurn
        ? MAX_DOCUMENT_BYTES - COMPLETION_RESERVE_BYTES
        : MAX_DOCUMENT_BYTES,
    );
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
