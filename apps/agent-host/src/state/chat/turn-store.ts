import { and, eq, sql } from "drizzle-orm";
import { replyPartsTable, textPiecesTable, turnRecordsTable } from "../persistence/schema";
import { TurnSchema, type ActiveTurn, type Turn } from "@experiments/protocol-schemas/ahp";
import { MAX_TURN_BYTES, COMPLETION_RESERVE_BYTES, checkBytes } from "../../memory";
import { encodedSize } from "../persistence/encoding";
import type { Database } from "../persistence/database";
import type { PartsStore } from "./parts-store";

const MAX_PARTS = 10_000;
const MAX_CHAT_METADATA_BYTES = 65_536;

type TurnRow = typeof turnRecordsTable.$inferSelect;

type TurnStoreParams = { db: Database; parts: PartsStore };

export class TurnStore {
  private readonly db: Database;
  private readonly parts: PartsStore;

  constructor({ db, parts }: TurnStoreParams) {
    this.db = db;
    this.parts = parts;
  }

  insertTurn(uri: string, turn: ActiveTurn | Turn): void {
    const { responseParts, ...metadata } = turn;
    const stub = { ...metadata, responseParts: [] };

    checkBytes(
      encodedSize(stub),
      MAX_CHAT_METADATA_BYTES,
      "Turn metadata exceeds the storage budget",
    );

    this.db
      .insert(turnRecordsTable)
      .values({
        chatUri: uri,
        turnId: turn.id,
        metadata: JSON.stringify(stub),
        bytes: encodedSize(stub),
        partCount: 0,
        blockingCount: 0,
        inputCount: 0,
      })
      .run();

    for (const [position, part] of responseParts.entries()) {
      this.parts.insert(uri, turn.id, position, part);
    }

    this.checkTurnBudget(uri, turn.id);
  }

  readTurnRecord(uri: string, id: string): TurnRow {
    const match = and(eq(turnRecordsTable.chatUri, uri), eq(turnRecordsTable.turnId, id));

    const row = this.db.select().from(turnRecordsTable).where(match).get();

    if (!row) {
      throw new Error("Turn record does not exist");
    }

    return row;
  }

  checkTurnBudget(uri: string, id: string, completed = false): void {
    const turn = this.readTurnRecord(uri, id);
    checkBytes(
      turn.bytes,
      completed ? MAX_TURN_BYTES : MAX_TURN_BYTES - COMPLETION_RESERVE_BYTES,
      "Turn exceeds the memory budget",
    );

    if (!completed) {
      checkBytes(turn.partCount, MAX_PARTS, "Turn has too many reply parts");
    }
  }

  writeTurnMetadata(uri: string, id: string, value: ActiveTurn | Turn): void {
    const previous = this.readTurnRecord(uri, id);
    const bytes = encodedSize(value);
    const previousBytes = new TextEncoder().encode(previous.metadata).byteLength;
    const reserve = "state" in value ? COMPLETION_RESERVE_BYTES : 0;
    const limit = MAX_CHAT_METADATA_BYTES + reserve;
    checkBytes(bytes, limit, "Turn metadata exceeds the storage budget");
    const match = and(eq(turnRecordsTable.chatUri, uri), eq(turnRecordsTable.turnId, id));

    this.db
      .update(turnRecordsTable)
      .set({
        metadata: JSON.stringify(value),
        bytes: sql`${turnRecordsTable.bytes} + ${bytes - previousBytes}`,
      })
      .where(match)
      .run();
    this.checkTurnBudget(uri, id, "state" in value);
  }

  readWithOutput(uri: string, turnId: string): Turn {
    const match = and(eq(turnRecordsTable.chatUri, uri), eq(turnRecordsTable.turnId, turnId));

    const row = this.db
      .select({ metadata: turnRecordsTable.metadata })
      .from(turnRecordsTable)
      .where(match)
      .get();

    if (!row) {
      throw new Error("Turn record does not exist");
    }

    const turn = TurnSchema.parse(JSON.parse(row.metadata));

    return { ...turn, responseParts: this.parts.readWithText(uri, turnId) };
  }

  deleteTurnRecords(chat: string, turn?: string): void {
    for (const table of [replyPartsTable, textPiecesTable, turnRecordsTable]) {
      const match = and(eq(table.chatUri, chat), turn === void 0 ? void 0 : eq(table.turnId, turn));

      this.db.delete(table).where(match).run();
    }
  }
}
