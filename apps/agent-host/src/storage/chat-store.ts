import { and, eq, max } from "drizzle-orm";
import { turns } from "./schema";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import {
  ChatStateSchema,
  ActiveTurnSchema,
  type ActiveTurn,
  type ChatAction,
  type ChatState,
  type Turn,
} from "@experiments/protocol-schemas/ahp";
import { MAX_TURN_BYTES, COMPLETION_RESERVE_BYTES, checkBytes } from "../memory";

import { reduceChat } from "../state/reducers";
import { TurnHistory } from "./history";
import { Parts, encodedSize } from "./parts";

const INITIAL_ORDINAL = -1;

const ACTIVITY_MASK = 31;

const INPUT_NEEDED = 24;

const IN_PROGRESS = 8;

const IDLE = 1;

const IS_READ = 32;

const MAX_PARTS = 10_000;

const MAX_CHAT_METADATA_BYTES = 65_536;

type TurnRow = {
  metadata: string;
  bytes: number;
  part_count: number;
  blocking_count: number;
  input_count: number;
};

type AgentUpdateContext = {
  partCount: number;
  lastPart?: ReturnType<Parts["readLastTextIdentity"]>;
  toolExists: boolean;
};

type ToolAction = Extract<ChatAction, { toolCallId: string }>;

type InputAction = Extract<
  ChatAction,
  { type: "chat/inputRequested" | "chat/inputAnswerChanged" | "chat/inputCompleted" }
>;

type EndAction = Extract<
  ChatAction,
  { type: "chat/turnComplete" | "chat/turnCancelled" | "chat/error" }
>;

type HistoryAction = Extract<
  ChatAction,
  { type: "chat/turnResume" | "chat/truncated" | "chat/turnsLoaded" }
>;

type Database = ReturnType<typeof drizzle>;

class ChatStore {
  private readonly db: Database;
  private readonly sql: SqlStorage;
  private readonly parts: Parts;
  private readonly history: TurnHistory;

  constructor(db: Database, sql: SqlStorage) {
    this.db = db;
    this.sql = sql;
    this.parts = new Parts(sql);
    this.history = new TurnHistory(sql, this.parts);
  }

  readMetadata(uri: string): ChatState {
    const row = this.sql
      .exec<{ metadata: string; active_turn: string | null }>(
        "SELECT metadata, active_turn FROM chats WHERE uri = ?",
        uri,
      )
      .one();

    const chat = ChatStateSchema.parse(JSON.parse(row.metadata));

    if (row.active_turn === null) {
      return chat;
    }

    const turn = this.readTurnRecord(uri, row.active_turn);

    return { ...chat, activeTurn: ActiveTurnSchema.parse(JSON.parse(turn.metadata)) };
  }

  readWithActiveOutput(uri: string): ChatState {
    const chat = this.readMetadata(uri);

    if (!chat.activeTurn) {
      return chat;
    }

    return {
      ...chat,
      activeTurn: {
        ...chat.activeTurn,
        responseParts: this.parts.readWithText(uri, chat.activeTurn.id),
      },
    };
  }

  activeStateBytes(uri: string): number {
    return (
      this.sql
        .exec<{ bytes: number }>(
          `SELECT LENGTH(CAST(metadata AS BLOB)) + COALESCE((SELECT bytes FROM turn_records WHERE chat_uri = uri AND turn_id = active_turn), 0) AS bytes FROM chats WHERE uri = ?`,
          uri,
        )
        .next().value?.bytes ?? 0
    );
  }

  snapshotBytes(uri: string): number {
    return this.activeStateBytes(uri) + this.history.storedBytes(uri);
  }

  readAgentUpdateContext(uri: string, toolId?: string): AgentUpdateContext {
    const chat = this.readMetadata(uri);

    if (!chat.activeTurn) {
      return { partCount: 0, toolExists: false };
    }

    const turn = this.readTurnRecord(uri, chat.activeTurn.id);

    return {
      partCount: turn.part_count,
      lastPart: this.parts.readLastTextIdentity(uri, chat.activeTurn.id, turn.part_count),
      toolExists:
        toolId !== void 0 &&
        this.parts
          .findByIdentity(uri, chat.activeTurn.id, toolId)
          .some((row) => row.kind === "toolCall"),
    };
  }

  readSnapshot(uri: string, count?: number): ChatState {
    return this.history.readSnapshot(
      uri,
      this.activeStateBytes(uri),
      () => this.readWithActiveOutput(uri),
      count,
    );
  }

  readHistoryPage(uri: string, cursor: string): ReturnType<TurnHistory["readPage"]> {
    return this.history.readPage(uri, cursor);
  }

  hasCompletedTurn(uri: string, turnId: string): boolean {
    const match = and(eq(turns.chatUri, uri), eq(turns.turnId, turnId));

    const row = this.db.select({ turnId: turns.turnId }).from(turns).where(match).get();

    return row !== void 0;
  }

  createChat(uri: string, chat: ChatState): void {
    if (chat.activeTurn || chat.turns.length) {
      throw new Error("Use record transitions to save turns");
    }

    this.sql.exec("INSERT INTO chats (uri, metadata) VALUES (?, ?)", uri, JSON.stringify(chat));
  }

  applyAction(uri: string, action: ChatAction): ChatState {
    const current = this.readMetadata(uri);
    const active = current.activeTurn;

    if (
      action.type === "chat/turnResume" ||
      action.type === "chat/truncated" ||
      action.type === "chat/turnsLoaded"
    ) {
      return this.applyHistoryAction(uri, current, action);
    }

    if (action.type === "chat/turnStarted") {
      const next = reduceChat(current, action);

      if (active) {
        this.parts.deleteTurnRecords(uri, active.id);
      }

      if (next.activeTurn) {
        this.insertTurn(uri, next.activeTurn);
      }

      this.writeChatMetadata(uri, next);

      return next;
    }

    if (!active || ("turnId" in action && action.turnId !== active.id)) {
      const next = reduceChat(current, action);

      if (
        active &&
        "toolCallId" in action &&
        action.type !== "chat/toolCallDelta" &&
        action.type !== "chat/toolCallContentChanged"
      ) {
        this.refreshStatus(uri, next);
      }

      this.writeChatMetadata(uri, next);

      return next;
    }

    if (
      action.type === "chat/turnComplete" ||
      action.type === "chat/turnCancelled" ||
      action.type === "chat/error"
    ) {
      return this.complete(uri, current, active, action);
    }

    if ("toolCallId" in action && action.type !== "chat/toolCallStart") {
      this.updateTool(uri, current, active, action);
    } else if (
      action.type === "chat/inputRequested" ||
      action.type === "chat/inputAnswerChanged" ||
      action.type === "chat/inputCompleted"
    ) {
      this.updateInput(uri, current, active, action);
    } else {
      this.updatePart(uri, current, active, action);
    }

    this.checkTurnBudget(uri, active.id);
    this.writeChatMetadata(uri, current);

    return this.readMetadata(uri);
  }

  private updatePart(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: ChatAction,
  ): void {
    if (action.type === "chat/delta" || action.type === "chat/reasoning") {
      const [row] = this.parts.findByIdentity(uri, active.id, action.partId, true);
      const kind = action.type === "chat/delta" ? "markdown" : "reasoning";

      if (row?.kind === kind) {
        this.parts.appendText(uri, active.id, row, action.content);
      }

      return;
    }

    if (action.type === "chat/responsePart") {
      if (action.part.kind !== "error") {
        this.parts.insert(
          uri,
          active.id,
          this.readTurnRecord(uri, active.id).part_count,
          action.part,
        );
      }

      return;
    }

    const next = reduceChat(current, action);

    if (action.type === "chat/toolCallStart") {
      const part = next.activeTurn?.responseParts[0];

      if (part) {
        this.parts.insert(uri, active.id, this.readTurnRecord(uri, active.id).part_count, part);
      }
    } else if (action.type === "chat/usage" && next.activeTurn) {
      this.writeTurnMetadata(uri, active.id, next.activeTurn);
    } else {
      Object.assign(current, next);
    }
  }

  private updateTool(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: ToolAction,
  ): void {
    const rows = this.parts
      .findByIdentity(uri, active.id, action.toolCallId)
      .filter((row) => row.kind === "toolCall");

    const selected = {
      ...current,
      activeTurn: { ...active, responseParts: rows.map((row) => this.parts.parseMetadata(row)) },
    };

    const next = reduceChat(selected, action);

    for (const [index, row] of rows.entries()) {
      const part = next.activeTurn?.responseParts[index];

      if (part && part !== selected.activeTurn.responseParts[index]) {
        this.parts.replace(uri, active.id, row, part);
      }
    }

    if (action.type !== "chat/toolCallDelta" && action.type !== "chat/toolCallContentChanged") {
      this.refreshStatus(uri, current);
    }
  }

  private updateInput(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: InputAction,
  ): void {
    const identity = action.type === "chat/inputRequested" ? action.request.id : action.requestId;

    const row = this.parts.findByIdentity(uri, active.id, identity).find((item) => {
      const part = this.parts.parseMetadata(item);

      return part.kind === "inputRequest" && part.response === void 0;
    });

    const selected = {
      ...current,
      activeTurn: { ...active, responseParts: row ? [this.parts.parseMetadata(row)] : [] },
    };

    const next = reduceChat(selected, action);
    const part = next.activeTurn?.responseParts[0];

    if (part) {
      if (row) {
        this.parts.replace(uri, active.id, row, part);
      } else {
        this.parts.insert(uri, active.id, this.readTurnRecord(uri, active.id).part_count, part);
      }
    }

    if (action.type !== "chat/inputAnswerChanged") {
      this.refreshStatus(uri, current);

      if (action.type === "chat/inputRequested") {
        current.status &= ~IS_READ;
      }
    }
  }

  private refreshStatus(uri: string, chat: ChatState): void {
    const active = chat.activeTurn;

    if (!active) {
      return;
    }

    const turn = this.readTurnRecord(uri, active.id);
    chat.status =
      (chat.status & ~ACTIVITY_MASK) |
      (turn.blocking_count + turn.input_count > 0 ? INPUT_NEEDED : IN_PROGRESS);
  }

  private complete(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: EndAction,
  ): ChatState {
    const rows = this.parts.readUnfinishedToolCalls(uri, active.id);

    const selected = {
      ...current,
      activeTurn: { ...active, responseParts: rows.map((row) => this.parts.parseMetadata(row)) },
    };

    const next = reduceChat(selected, action);
    const [finished] = next.turns;

    if (!finished) {
      return current;
    }

    for (const [index, row] of rows.entries()) {
      const part = finished.responseParts[index];

      if (part) {
        this.parts.replace(uri, active.id, row, part);
      }
    }

    if (action.type === "chat/error") {
      this.parts.insert(
        uri,
        active.id,
        this.readTurnRecord(uri, active.id).part_count,
        action.part,
      );
    }

    this.writeTurnMetadata(uri, active.id, { ...finished, responseParts: [] });
    this.addHistory(uri, active.id);
    const chat = { ...next, turns: [] };
    this.writeChatMetadata(uri, chat);

    return chat;
  }

  private addHistory(uri: string, id: string): void {
    const highest = this.db
      .select({ ordinal: max(turns.ordinal) })
      .from(turns)
      .where(eq(turns.chatUri, uri))
      .get();

    this.db
      .insert(turns)
      .values({ chatUri: uri, turnId: id, ordinal: (highest?.ordinal ?? INITIAL_ORDINAL) + 1 })
      .run();
  }

  private applyHistoryAction(uri: string, current: ChatState, action: HistoryAction): ChatState {
    if (action.type === "chat/turnsLoaded") {
      // History delivery is handled by fetchTurns, never applied to current records.
      return current;
    }

    if (action.type === "chat/turnResume") {
      if (current.activeTurn) {
        return current;
      }

      const latest = this.sql
        .exec<{ turn_id: string }>(
          "SELECT turn_id FROM turns WHERE chat_uri = ? ORDER BY ordinal DESC LIMIT 1",
          uri,
        )
        .next().value;

      if (latest?.turn_id !== action.turnId) {
        return current;
      }

      const turn = this.history.readTurn(uri, action.turnId);
      const reduced = reduceChat({ ...current, turns: [turn] }, action);

      if (!reduced.activeTurn) {
        return current;
      }

      const active = { ...reduced.activeTurn, responseParts: [] };

      this.writeTurnMetadata(uri, active.id, active);
      this.removeHistory(uri, active.id);
      const next = { ...reduced, turns: [], activeTurn: active };
      this.refreshStatus(uri, next);
      this.writeChatMetadata(uri, next);

      return next;
    }

    const boundary =
      action.turnId === void 0
        ? void 0
        : this.sql
            .exec<{ ordinal: number }>(
              "SELECT ordinal FROM turns WHERE chat_uri = ? AND turn_id = ?",
              uri,
              action.turnId,
            )
            .next().value;

    if (action.turnId !== void 0 && !boundary) {
      return current;
    }

    const removed = this.sql
      .exec<{ turn_id: string }>(
        "SELECT turn_id FROM turns WHERE chat_uri = ? AND ordinal > ?",
        uri,
        boundary?.ordinal ?? INITIAL_ORDINAL,
      )
      .toArray();

    for (const row of removed) {
      this.parts.deleteTurnRecords(uri, row.turn_id);
      this.removeHistory(uri, row.turn_id);
    }

    if (current.activeTurn) {
      this.parts.deleteTurnRecords(uri, current.activeTurn.id);
    }

    const next = {
      ...current,
      activeTurn: void 0,
      status: (current.status & ~ACTIVITY_MASK) | IDLE,
    };

    if (action.turnId === void 0) {
      delete next.turnsNextCursor;
    }

    this.writeChatMetadata(uri, next);

    return next;
  }

  private removeHistory(uri: string, id: string): void {
    const match = and(eq(turns.chatUri, uri), eq(turns.turnId, id));
    this.db.delete(turns).where(match).run();
  }

  deleteChat(uri: string): void {
    this.db.delete(turns).where(eq(turns.chatUri, uri)).run();
    this.parts.deleteTurnRecords(uri);
    this.sql.exec("DELETE FROM chats WHERE uri = ?", uri);
  }

  private insertTurn(uri: string, turn: ActiveTurn | Turn): void {
    const { responseParts, ...metadata } = turn;
    const stub = { ...metadata, responseParts: [] };

    checkBytes(
      encodedSize(stub),
      MAX_CHAT_METADATA_BYTES,
      "Turn metadata exceeds the storage budget",
    );

    this.sql.exec(
      "INSERT INTO turn_records VALUES (?, ?, ?, ?, 0, 0, 0)",
      uri,
      turn.id,
      JSON.stringify(stub),
      encodedSize(stub),
    );

    for (const [position, part] of responseParts.entries()) {
      this.parts.insert(uri, turn.id, position, part);
    }

    this.checkTurnBudget(uri, turn.id);
  }

  private readTurnRecord(uri: string, id: string): TurnRow {
    return this.sql
      .exec<TurnRow>("SELECT * FROM turn_records WHERE chat_uri = ? AND turn_id = ?", uri, id)
      .one();
  }

  private checkTurnBudget(uri: string, id: string, completed = false): void {
    const turn = this.readTurnRecord(uri, id);
    checkBytes(
      turn.bytes,
      completed ? MAX_TURN_BYTES : MAX_TURN_BYTES - COMPLETION_RESERVE_BYTES,
      "Turn exceeds the memory budget",
    );

    if (!completed) {
      checkBytes(turn.part_count, MAX_PARTS, "Turn has too many reply parts");
    }
  }

  private writeTurnMetadata(uri: string, id: string, value: ActiveTurn | Turn): void {
    const previous = this.readTurnRecord(uri, id);
    const bytes = encodedSize(value);
    const previousBytes = new TextEncoder().encode(previous.metadata).byteLength;
    const reserve = "state" in value ? COMPLETION_RESERVE_BYTES : 0;
    const limit = MAX_CHAT_METADATA_BYTES + reserve;
    checkBytes(bytes, limit, "Turn metadata exceeds the storage budget");
    this.sql.exec(
      "UPDATE turn_records SET metadata = ?, bytes = bytes + ? WHERE chat_uri = ? AND turn_id = ?",
      JSON.stringify(value),
      bytes - previousBytes,
      uri,
      id,
    );
    this.checkTurnBudget(uri, id, "state" in value);
  }

  private writeChatMetadata(uri: string, chat: ChatState): void {
    const { activeTurn, ...metadata } = chat;
    const text = JSON.stringify(metadata);
    const bytes = encodedSize(metadata);

    checkBytes(bytes, MAX_CHAT_METADATA_BYTES, "Chat metadata exceeds the storage budget");

    this.sql.exec(
      "UPDATE chats SET metadata = ?, active_turn = ? WHERE uri = ? AND (metadata != ? OR active_turn IS NOT ?)",
      text,
      activeTurn?.id ?? null,
      uri,
      text,
      activeTurn?.id ?? null,
    );
  }
}

export { ChatStore };
