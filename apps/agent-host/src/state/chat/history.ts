import * as z from "zod";
import { and, asc, desc, eq, gt, lt, max, sql } from "drizzle-orm";
import { turnsTable, turnRecordsTable } from "../persistence/schema";
import type { ChatState, Turn } from "@experiments/protocol-schemas/ahp";
import { ProtocolError, RpcCodes } from "../../ahp/protocol";
import { MAX_HISTORY_PAGE_BYTES, checkBytes } from "../../memory";
import type { Database } from "../persistence/database";
import type { TurnStore } from "./turn-store";

const INITIAL_ORDINAL = -1;

const HISTORY_PAGE_TURNS = 100;

const CursorSchema = z.object({ channel: z.string(), before: z.int().nonnegative() });

type HistoryPage = Pick<ChatState, "turns" | "turnsNextCursor">;

type TurnHistoryParams = { db: Database; turns: TurnStore };

export class TurnHistory {
  private readonly db: Database;
  private readonly turns: TurnStore;

  constructor({ db, turns }: TurnHistoryParams) {
    this.db = db;
    this.turns = turns;
  }

  storedBytes(uri: string): number {
    const match = and(
      eq(turnRecordsTable.chatUri, turnsTable.chatUri),
      eq(turnRecordsTable.turnId, turnsTable.turnId),
    );

    const normalized =
      this.db
        .select({ bytes: sql<number>`COALESCE(SUM(${turnRecordsTable.bytes}), 0)` })
        .from(turnsTable)
        .innerJoin(turnRecordsTable, match)
        .where(eq(turnsTable.chatUri, uri))
        .get()?.bytes ?? 0;

    return normalized;
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

  readPageBefore(uri: string, before: number, count: number, budget: number): HistoryPage {
    const limit = Math.min(count, HISTORY_PAGE_TURNS);
    const history: Turn[] = [];
    let remaining = budget;
    let boundary = before;
    let more = false;

    const match = and(
      eq(turnRecordsTable.chatUri, turnsTable.chatUri),
      eq(turnRecordsTable.turnId, turnsTable.turnId),
    );

    const pageMatch = and(eq(turnsTable.chatUri, uri), lt(turnsTable.ordinal, before));

    const rows = this.db
      .select({
        turnId: turnsTable.turnId,
        ordinal: turnsTable.ordinal,
        bytes: turnRecordsTable.bytes,
      })
      .from(turnsTable)
      .innerJoin(turnRecordsTable, match)
      .where(pageMatch)
      .orderBy(desc(turnsTable.ordinal))
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

      history.unshift(this.turns.readWithOutput(uri, row.turnId));
      remaining -= row.bytes;
      boundary = row.ordinal;
    }

    const page: HistoryPage = { turns: history };

    if (more) {
      page.turnsNextCursor = JSON.stringify({ channel: uri, before: boundary });
    }

    return page;
  }

  hasCompletedTurn(uri: string, turnId: string): boolean {
    const match = and(eq(turnsTable.chatUri, uri), eq(turnsTable.turnId, turnId));

    const row = this.db.select({ turnId: turnsTable.turnId }).from(turnsTable).where(match).get();

    return row !== void 0;
  }

  addHistory(uri: string, id: string): void {
    const highest = this.db
      .select({ ordinal: max(turnsTable.ordinal) })
      .from(turnsTable)
      .where(eq(turnsTable.chatUri, uri))
      .get();

    this.db
      .insert(turnsTable)
      .values({ chatUri: uri, turnId: id, ordinal: (highest?.ordinal ?? INITIAL_ORDINAL) + 1 })
      .run();
  }

  removeHistory(uri: string, id: string): void {
    const match = and(eq(turnsTable.chatUri, uri), eq(turnsTable.turnId, id));
    this.db.delete(turnsTable).where(match).run();
  }

  latestCompletedTurn(uri: string): { turnId: string } | undefined {
    return this.db
      .select({ turnId: turnsTable.turnId })
      .from(turnsTable)
      .where(eq(turnsTable.chatUri, uri))
      .orderBy(desc(turnsTable.ordinal))
      .limit(1)
      .get();
  }

  deleteHistoryAfter(uri: string, turnId?: string): boolean {
    const match =
      turnId === void 0 ? void 0 : and(eq(turnsTable.chatUri, uri), eq(turnsTable.turnId, turnId));

    const boundary =
      turnId === void 0
        ? void 0
        : this.db.select({ ordinal: turnsTable.ordinal }).from(turnsTable).where(match).get();

    if (turnId !== void 0 && !boundary) {
      return false;
    }

    const removedMatch = and(
      eq(turnsTable.chatUri, uri),
      gt(turnsTable.ordinal, boundary?.ordinal ?? INITIAL_ORDINAL),
    );

    const removed = this.db
      .select({ turnId: turnsTable.turnId })
      .from(turnsTable)
      .where(removedMatch)
      .all();

    for (const row of removed) {
      this.turns.deleteTurnRecords(uri, row.turnId);
      this.removeHistory(uri, row.turnId);
    }

    return true;
  }

  readAll(uri: string): Turn[] {
    const history: Turn[] = [];

    for (const row of this.db
      .select({ turnId: turnsTable.turnId })
      .from(turnsTable)
      .where(eq(turnsTable.chatUri, uri))
      .orderBy(asc(turnsTable.ordinal))
      .all()) {
      history.push(this.turns.readWithOutput(uri, row.turnId));
    }

    return history;
  }

  deleteChatHistory(uri: string): void {
    this.db.delete(turnsTable).where(eq(turnsTable.chatUri, uri)).run();
  }
}
