import * as z from "zod";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import { turns, turnRecords } from "./schema";
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

type Database = ReturnType<typeof drizzle>;

class TurnHistory {
  private readonly db: Database;
  private readonly parts: Parts;

  constructor(db: Database, parts: Parts) {
    this.db = db;
    this.parts = parts;
  }

  storedBytes(uri: string): number {
    const match = and(eq(turnRecords.chatUri, turns.chatUri), eq(turnRecords.turnId, turns.turnId));

    const normalized =
      this.db
        .select({ bytes: sql<number>`COALESCE(SUM(${turnRecords.bytes}), 0)` })
        .from(turns)
        .innerJoin(turnRecords, match)
        .where(eq(turns.chatUri, uri))
        .get()?.bytes ?? 0;

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

    for (const row of this.db
      .select({ turnId: turns.turnId })
      .from(turns)
      .where(eq(turns.chatUri, uri))
      .orderBy(asc(turns.ordinal))
      .all()) {
      history.push(this.readTurn(uri, row.turnId));
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

    const match = and(eq(turnRecords.chatUri, turns.chatUri), eq(turnRecords.turnId, turns.turnId));

    const pageMatch = and(eq(turns.chatUri, uri), lt(turns.ordinal, before));

    const rows = this.db
      .select({ turnId: turns.turnId, ordinal: turns.ordinal, bytes: turnRecords.bytes })
      .from(turns)
      .innerJoin(turnRecords, match)
      .where(pageMatch)
      .orderBy(desc(turns.ordinal))
      .limit(limit + 1)
      .all();

    for (const row of rows) {
      if (history.length >= limit || row.bytes > remaining) {
        if (history.length === 0 && limit > 0) {
          checkBytes(row.bytes, remaining, "Turn exceeds the history page memory budget");
        }

        more = true;
        break;
      }

      history.unshift(this.readTurn(uri, row.turnId));
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
    const match = and(eq(turnRecords.chatUri, uri), eq(turnRecords.turnId, turnId));

    const row = this.db
      .select({ metadata: turnRecords.metadata })
      .from(turnRecords)
      .where(match)
      .get();

    if (!row) {
      throw new Error("Turn record does not exist");
    }

    const turn = TurnSchema.parse(JSON.parse(row.metadata));

    return { ...turn, responseParts: this.parts.readWithText(uri, turnId) };
  }
}

export { TurnHistory };
