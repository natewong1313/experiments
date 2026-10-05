import * as z from "zod";
import { TurnSchema, type ChatState, type Turn } from "@experiments/protocol-schemas/ahp";
import type { Parts } from "./parts";
import { ProtocolError, RpcCodes } from "../ahp/protocol";
import {
  MAX_SNAPSHOT_BYTES,
  MAX_HISTORY_PAGE_BYTES,
  RESPONSE_RESERVE_BYTES,
  checkBytes,
} from "../memory";

const HISTORY_PAGE_TURNS = 100;

const CursorSchema = z.object({ channel: z.string(), before: z.int().nonnegative() });

type HistoryPage = Pick<ChatState, "turns" | "turnsNextCursor">;

type HistoryTurnRow = { metadata: string };

class TurnHistory {
  private readonly sql: SqlStorage;
  private readonly parts: Parts;

  constructor(sql: SqlStorage, parts: Parts) {
    this.sql = sql;
    this.parts = parts;
  }
  storedBytes(uri: string): number {
    const normalized = this.sql
      .exec<{ bytes: number }>(
        `SELECT COALESCE(SUM(r.bytes), 0) AS bytes FROM turns t JOIN turn_records r ON r.chat_uri = t.chat_uri AND r.turn_id = t.turn_id WHERE t.chat_uri = ?`,
        uri,
      )
      .one().bytes;

    return normalized;
  }

  readSnapshot(uri: string, liveBytes: number, live: () => ChatState, count?: number): ChatState {
    checkBytes(
      liveBytes,
      MAX_SNAPSHOT_BYTES - RESPONSE_RESERVE_BYTES,
      "Active turn exceeds the snapshot memory budget",
    );
    const budget = MAX_SNAPSHOT_BYTES - liveBytes - RESPONSE_RESERVE_BYTES;

    if (count !== void 0) {
      return {
        ...live(),
        ...this.readPageBefore(uri, Number.MAX_SAFE_INTEGER, count, budget),
      };
    }

    checkBytes(
      this.storedBytes(uri),
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

    return { ...live(), turns: history };
  }

  readPage(uri: string, cursor: string): HistoryPage {
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

    return this.readPageBefore(uri, parsed.data.before, HISTORY_PAGE_TURNS, MAX_HISTORY_PAGE_BYTES);
  }

  private readPageBefore(uri: string, before: number, count: number, budget: number): HistoryPage {
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
      `SELECT t.turn_id, t.ordinal, r.bytes
       FROM turns t JOIN turn_records r ON r.chat_uri = t.chat_uri AND r.turn_id = t.turn_id WHERE t.chat_uri = ? AND t.ordinal < ? ORDER BY t.ordinal DESC LIMIT ?`,
      uri,
      before,
      limit + 1,
    );

    for (const row of rows) {
      if (history.length >= limit || row.bytes > remaining) {
        if (history.length === 0 && limit > 0) {
          checkBytes(row.bytes, remaining, "Turn exceeds the history page memory budget");
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

  readTurn(uri: string, turnId: string): Turn {
    const row = this.sql
      .exec<HistoryTurnRow>(
        "SELECT * FROM turn_records WHERE chat_uri = ? AND turn_id = ?",
        uri,
        turnId,
      )
      .one();

    const turn = TurnSchema.parse(JSON.parse(row.metadata));

    return { ...turn, responseParts: this.parts.readWithText(uri, turnId) };
  }
}

export { TurnHistory };
