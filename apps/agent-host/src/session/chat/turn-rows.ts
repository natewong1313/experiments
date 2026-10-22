import { and, asc, desc, eq, gte, lt, max, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  MessageKind as AHPMessageKind,
  ResponsePartKind as AHPResponsePartKind,
  ToolCallStatus as AHPToolCallStatus,
} from "@microsoft/agent-host-protocol";
import type {
  ActiveTurn as AHPActiveTurn,
  Message as AHPMessage,
  ResponsePart as AHPResponsePart,
  Turn as AHPTurn,
  UsageInfo as AHPUsageInfo,
} from "@microsoft/agent-host-protocol";
import type { SessionDatabaseOrm } from "../db/database";
import { responsePartsTable, textSegmentsTable, turnsTable } from "../db/schema";
import type { ResponsePartRecord, StoredTurnState, TurnRecord } from "../db/schema";
import { hasText, joinText, SEGMENT_BYTES, splitPart, splitText } from "./text";

/**
 * A stored part for reducer input. `part` retains only a trailing high surrogate from its
 * streamed text, as described in `splitPart`. `payload` is the JSON representation of `part`.
 */
export type LoadedPart = { row: number; part: AHPResponsePart; payload: string };

/** The turn fields that a reducer input needs. The message is not loaded. */
export type TurnHeader = Pick<
  TurnRecord,
  "id" | "turnId" | "position" | "state" | "startedAt" | "usage"
>;

/**
 * Selects the parts of a turn for reducer input. `first` selects the first part with the target ID.
 * `targets` selects all parts with that ID. `pending` selects all pending parts and includes the
 * last part if `withLast` is true.
 */
export type PartSelection =
  | { kind: "none" }
  | { kind: "first"; targetId: string }
  | { kind: "targets"; targetId: string }
  | { kind: "pending"; withLast: boolean };

export type TurnChangeParams = {
  state?: StoredTurnState;
  startedAt?: string | null;
  duration?: number | null;
  usage?: AHPUsageInfo | null;
};

export type LoadedTurns = { turns: AHPTurn[]; activeTurn?: AHPActiveTurn };

/** Reducer inputs use this placeholder message. Stored messages do not change after insertion. */
export const UNLOADED_MESSAGE: AHPMessage = { text: "", origin: { kind: AHPMessageKind.User } };

const HEADER_COLUMNS = {
  id: turnsTable.id,
  turnId: turnsTable.turnId,
  position: turnsTable.position,
  state: turnsTable.state,
  startedAt: turnsTable.startedAt,
  usage: turnsTable.usage,
};

const PART_COLUMNS = {
  row: responsePartsTable.id,
  position: responsePartsTable.position,
  payload: responsePartsTable.payload,
};

/** The columns of a part row that a reducer input needs. */
type PartRow = { row: number; position: number; payload: AHPResponsePart };

const LAST = -1;

/**
 * Reads and writes chat turns, response parts, and text segments. Reducer inputs omit turn
 * messages and stored streamed text. Snapshot reads load turns, parts, and text segments
 * for the requested range.
 */
export class TurnRows {
  private orm: SessionDatabaseOrm;

  constructor(orm: SessionDatabaseOrm) {
    this.orm = orm;
  }

  /** Returns the turn with the AHP turn ID, active or ended. */
  lookup(chat: string, turnId: string): TurnHeader | undefined {
    const matches = and(eq(turnsTable.chat, chat), eq(turnsTable.turnId, turnId));

    return this.orm.select(HEADER_COLUMNS).from(turnsTable).where(matches).get();
  }

  header(row: number): TurnHeader | undefined {
    return this.orm.select(HEADER_COLUMNS).from(turnsTable).where(eq(turnsTable.id, row)).get();
  }

  /** Returns the ended turn with the highest position. */
  lastEnded(chat: string): TurnHeader | undefined {
    return this.orm
      .select(HEADER_COLUMNS)
      .from(turnsTable)
      .where(endedTurns(chat))
      .orderBy(desc(turnsTable.position))
      .limit(1)
      .get();
  }

  /**
   * Returns the position of the ended turn that has `skip` ended turns after it, or undefined
   * if the chat has no such turn.
   */
  endedPosition(chat: string, skip: number): number | undefined {
    const row = this.orm
      .select({ position: turnsTable.position })
      .from(turnsTable)
      .where(endedTurns(chat))
      .orderBy(desc(turnsTable.position))
      .limit(1)
      .offset(skip)
      .get();

    return row?.position;
  }

  /** Returns the lowest position of the `limit` ended turns before position `before`. */
  pageStart(chat: string, before: number, limit: number): number | undefined {
    const older = and(endedTurns(chat), lt(turnsTable.position, before));

    const rows = this.orm
      .select({ position: turnsTable.position })
      .from(turnsTable)
      .where(older)
      .orderBy(desc(turnsTable.position))
      .limit(limit)
      .all();

    return rows.at(LAST)?.position;
  }

  /** Returns true if the chat has an ended turn before position `before`. */
  hasEndedBefore(chat: string, before: number): boolean {
    return this.pageStart(chat, before, 1) !== undefined;
  }

  /** Inserts an active turn after the other turns of the chat. Returns its row ID. */
  insert(chat: string, turn: AHPActiveTurn): number {
    const last = this.orm
      .select({ position: max(turnsTable.position) })
      .from(turnsTable)
      .where(eq(turnsTable.chat, chat))
      .get();

    const inserted = this.orm
      .insert(turnsTable)
      .values({
        chat,
        turnId: turn.id,
        position: nextPosition(last?.position),
        state: "active",
        startedAt: turn.startedAt,
        message: turn.message,
        usage: turn.usage,
      })
      .returning({ id: turnsTable.id })
      .get();

    this.writeParts(inserted.id, [], turn.responseParts);

    return inserted.id;
  }

  update(row: number, values: TurnChangeParams): void {
    this.orm.update(turnsTable).set(values).where(eq(turnsTable.id, row)).run();
  }

  /**
   * Deletes the turns of a chat at position `from` and after it. The foreign keys delete their
   * parts and text segments.
   */
  deleteFrom(chat: string, from: number): void {
    const removed = and(eq(turnsTable.chat, chat), gte(turnsTable.position, from));
    this.orm.delete(turnsTable).where(removed).run();
  }

  /**
   * Returns the parts of a turn that `selection` names, in stream order. Each query uses an
   * index, so the other parts of the turn are not read.
   */
  reducerParts(turn: number, selection: PartSelection): LoadedPart[] {
    const ofTurn = eq(responsePartsTable.turn, turn);
    const rows: PartRow[] = [];

    // A target query has no `pending` condition.
    // With that condition, SQLite can use the pending index and read all pending parts.
    if (selection.kind === "first" || selection.kind === "targets") {
      const targeted = and(ofTurn, eq(responsePartsTable.targetId, selection.targetId));
      rows.push(...this.partRows(targeted, selection.kind === "first" ? 1 : undefined));
    }

    if (selection.kind === "pending") {
      const pendingParts = and(ofTurn, eq(responsePartsTable.pending, true));
      rows.push(...this.partRows(pendingParts));

      if (selection.withLast) {
        rows.push(...this.partRows(ofTurn, 1, desc));
      }
    }

    const unique = new Map(rows.map((row) => [row.row, row]));

    return [...unique.values()]
      .toSorted((first, second) => first.position - second.position)
      .map(({ row, payload }) => ({ row, part: payload, payload: JSON.stringify(payload) }));
  }

  /**
   * Writes the parts changed or added by the reducer. `after` keeps the parts of `before` at
   * the same indices and appends new parts. Changed parts contain only new streamed text.
   * The store appends this text to the stored segments.
   */
  writeParts(turn: number, before: LoadedPart[], after: AHPResponsePart[]): void {
    if (after.length < before.length) {
      throw new Error("A reducer removed a response part");
    }

    let position: number | undefined;

    for (const [index, part] of after.entries()) {
      const loaded = before[index];

      if (loaded === undefined) {
        position ??= this.nextPartPosition(turn);
        this.insertPart(turn, position, part);
        position += 1;
      } else if (loaded.part !== part) {
        this.updatePart(loaded, part);
      }
    }
  }

  /**
   * Loads turns with positions at or above `from` and below `to`, including their parts and text.
   * If `to` is undefined, there is no upper bound.
   */
  load(chat: string, from: number, to?: number): LoadedTurns {
    const range = and(
      eq(turnsTable.chat, chat),
      gte(turnsTable.position, from),
      to === undefined ? undefined : lt(turnsTable.position, to),
    );

    const turns = this.orm
      .select()
      .from(turnsTable)
      .where(range)
      .orderBy(asc(turnsTable.position))
      .all();

    const texts = this.loadTexts(range);
    const parts = this.loadParts(range);
    const loaded: LoadedTurns = { turns: [] };

    for (const turn of turns) {
      const responseParts = (parts.get(turn.id) ?? []).map((part) =>
        joinText(part.payload, texts.get(part.id)?.join("") ?? ""),
      );

      const contents = {
        id: turn.turnId,
        message: turn.message,
        responseParts,
        usage: turn.usage ?? undefined,
      };

      if (turn.state === "active") {
        loaded.activeTurn = { ...contents, startedAt: turn.startedAt ?? "" };
      } else {
        loaded.turns.push(endedTurn(turn, contents));
      }
    }

    return loaded;
  }

  /** Returns the parts of the turns in `range`, grouped by turn, in stream order. */
  private loadParts(range: SQL | undefined): Map<number, ResponsePartRecord[]> {
    const rows = this.orm
      .select({ part: responsePartsTable })
      .from(responsePartsTable)
      .innerJoin(turnsTable, eq(responsePartsTable.turn, turnsTable.id))
      .where(range)
      .orderBy(asc(responsePartsTable.turn), asc(responsePartsTable.position))
      .all();

    return groupBy(
      rows.map((row) => row.part),
      (part) => part.turn,
    );
  }

  /** Returns the text segments of the parts of the turns in `range`, grouped by part, in order. */
  private loadTexts(range: SQL | undefined): Map<number, string[]> {
    const rows = this.orm
      .select({ part: textSegmentsTable.part, text: textSegmentsTable.text })
      .from(textSegmentsTable)
      .innerJoin(responsePartsTable, eq(textSegmentsTable.part, responsePartsTable.id))
      .innerJoin(turnsTable, eq(responsePartsTable.turn, turnsTable.id))
      .where(range)
      .orderBy(asc(textSegmentsTable.part), asc(textSegmentsTable.position))
      .all();

    const texts: Map<number, string[]> = new Map();

    for (const [part, segments] of groupBy(rows, (row) => row.part)) {
      texts.set(
        part,
        segments.map((segment) => segment.text),
      );
    }

    return texts;
  }

  /** Returns the matching parts in stream order, or in reverse order with `desc`. */
  private partRows(where: SQL | undefined, limit?: number, direction: typeof asc = asc): PartRow[] {
    const query = this.orm
      .select(PART_COLUMNS)
      .from(responsePartsTable)
      .where(where)
      .orderBy(direction(responsePartsTable.position));

    return limit === undefined ? query.all() : query.limit(limit).all();
  }

  private nextPartPosition(turn: number): number {
    const last = this.orm
      .select({ position: max(responsePartsTable.position) })
      .from(responsePartsTable)
      .where(eq(responsePartsTable.turn, turn))
      .get();

    return nextPosition(last?.position);
  }

  private insertPart(turn: number, position: number, part: AHPResponsePart): void {
    const { payload, text } = splitPart(part);

    const inserted = this.orm
      .insert(responsePartsTable)
      .values({ turn, position, ...partColumns(payload) })
      .returning({ id: responsePartsTable.id })
      .get();

    if (text !== undefined && text !== "") {
      this.appendText(inserted.id, text);
    }
  }

  private updatePart(loaded: LoadedPart, part: AHPResponsePart): void {
    const { payload, text } = splitPart(part);

    if (JSON.stringify(payload) !== loaded.payload) {
      this.orm
        .update(responsePartsTable)
        .set(partColumns(payload))
        .where(eq(responsePartsTable.id, loaded.row))
        .run();
    }

    if (text === undefined) {
      // A tool call that stops streaming replaces its partial input with its tool input.
      if (hasText(loaded.part)) {
        this.orm.delete(textSegmentsTable).where(eq(textSegmentsTable.part, loaded.row)).run();
      }
    } else if (text !== "") {
      this.appendText(loaded.row, text);
    }
  }

  /**
   * Appends text to a part. Fills the last segment before inserting new segments.
   * Earlier segments do not change.
   */
  private appendText(part: number, text: string): void {
    const last = this.orm
      .select({ position: textSegmentsTable.position, bytes: textSegmentsTable.bytes })
      .from(textSegmentsTable)
      .where(eq(textSegmentsTable.part, part))
      .orderBy(desc(textSegmentsTable.position))
      .limit(1)
      .get();

    const [first, ...rest] = splitText(text, last ? SEGMENT_BYTES - last.bytes : 0);

    if (last && first && first.bytes > 0) {
      const lastSegment = and(
        eq(textSegmentsTable.part, part),
        eq(textSegmentsTable.position, last.position),
      );

      this.orm
        .update(textSegmentsTable)
        .set({
          text: sql`${textSegmentsTable.text} || ${first.text}`,
          bytes: last.bytes + first.bytes,
        })
        .where(lastSegment)
        .run();
    }

    const start = nextPosition(last?.position);

    for (const [index, chunk] of rest.entries()) {
      this.orm
        .insert(textSegmentsTable)
        .values({ part, position: start + index, text: chunk.text, bytes: chunk.bytes })
        .run();
    }
  }
}

function endedTurns(chat: string): SQL | undefined {
  return and(eq(turnsTable.chat, chat), ne(turnsTable.state, "active"));
}

function nextPosition(last: number | null | undefined): number {
  return last === undefined || last === null ? 0 : last + 1;
}

function endedTurn(turn: TurnRecord, contents: Omit<AHPTurn, "state">): AHPTurn {
  if (turn.state === "active") {
    throw new Error("Turn is active");
  }

  const ended: AHPTurn = { ...contents, state: turn.state };

  if (turn.startedAt !== null) {
    ended.startedAt = turn.startedAt;
  }

  if (turn.duration !== null) {
    ended.duration = turn.duration;
  }

  return ended;
}

type PartColumns = Pick<ResponsePartRecord, "kind" | "targetId" | "pending" | "payload">;

function partColumns(payload: AHPResponsePart): PartColumns {
  return {
    kind: payload.kind,
    targetId: targetIdOf(payload),
    pending: isPending(payload),
    payload,
  };
}

/**
 * The AHP chat reducer matches `chat/delta` and `chat/reasoning` against this ID before checking
 * the part kind. Tool calls use `toolCallId`. Markdown and reasoning parts use `id`.
 */
function targetIdOf(part: AHPResponsePart): string | null {
  if (part.kind === AHPResponsePartKind.ToolCall) {
    return part.toolCall.toolCallId;
  }

  if (part.kind === AHPResponsePartKind.Markdown || part.kind === AHPResponsePartKind.Reasoning) {
    return part.id;
  }

  return null;
}

/**
 * Pending parts can change in later actions or affect chat status.
 * A tool call remains pending unless it is complete or cancelled. An input request remains
 * pending until it has a response.
 */
function isPending(part: AHPResponsePart): boolean {
  if (part.kind === AHPResponsePartKind.ToolCall) {
    const { status } = part.toolCall;

    return status !== AHPToolCallStatus.Completed && status !== AHPToolCallStatus.Cancelled;
  }

  return part.kind === AHPResponsePartKind.InputRequest && part.response === undefined;
}

function groupBy<Row>(rows: Row[], key: (row: Row) => number): Map<number, Row[]> {
  const groups: Map<number, Row[]> = new Map();

  for (const row of rows) {
    const group = groups.get(key(row)) ?? [];
    group.push(row);
    groups.set(key(row), group);
  }

  return groups;
}
