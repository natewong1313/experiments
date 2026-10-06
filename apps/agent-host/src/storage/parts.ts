import * as z from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import { replyPartsTable, textPiecesTable, turnRecordsTable } from "./schema";
import {
  type metaSchema,
  ResponsePartSchema,
  type ResponsePart,
  type StateAction,
  type ChatState,
  type Turn,
  type ActiveTurn,
  type ContentRef,
  type ResourceReadResult,
} from "@experiments/protocol-schemas/ahp";
import { checkBytes } from "../memory";

const PIECE_CHARACTERS = 16_384;

const JSON_PIECE_CHARACTERS = 8192;

const HIGH_SURROGATE_START = 0xd8_00;

const HIGH_SURROGATE_END = 0xdb_ff;

const STRING_QUOTES = 2;

const MAX_PART_METADATA_BYTES = 65_536;

type StoredValue =
  | StateAction
  | ChatState
  | Turn
  | ActiveTurn
  | ResponsePart
  | ContentRef
  | ResourceReadResult
  | string
  | ReturnType<typeof metaSchema.parse>;

function encodedSize(value: StoredValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function pieceEnd(text: string, offset: number, limit = PIECE_CHARACTERS): number {
  const end = Math.min(offset + limit, text.length);
  const last = text.charCodeAt(end - 1);

  return end < text.length && last >= HIGH_SURROGATE_START && last <= HIGH_SURROGATE_END
    ? end - 1
    : end;
}

type StoredPiece = { data: string };

function readPiece(piece: StoredPiece): string {
  const text: unknown = JSON.parse(piece.data);

  return z.string().parse(text);
}

function blocking(part: ResponsePart): number {
  return part.kind === "toolCall" &&
    (part.toolCall.status === "pending-confirmation" ||
      part.toolCall.status === "pending-result-confirmation" ||
      part.toolCall.status === "auth-required")
    ? 1
    : 0;
}

function openInput(part: ResponsePart): number {
  return part.kind === "inputRequest" && part.response === void 0 ? 1 : 0;
}

type PartRow = typeof replyPartsTable.$inferSelect;

type Database = ReturnType<typeof drizzle>;

type TextPartIdentity = Pick<Extract<ResponsePart, { id: string }>, "kind" | "id">;

type InsertPartParams = {
  chat: string;
  turn: string;
  position: number;
  part: ResponsePart;
};

type AppendPiecesParams = {
  chat: string;
  turn: string;
  position: number;
  start: number;
  text: string;
};

class Parts {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  parseMetadata(row: PartRow): ResponsePart {
    return ResponsePartSchema.parse(JSON.parse(row.metadata));
  }

  readRows(chat: string, turn: string): PartRow[] {
    const match = and(eq(replyPartsTable.chatUri, chat), eq(replyPartsTable.turnId, turn));

    return this.db
      .select()
      .from(replyPartsTable)
      .where(match)
      .orderBy(asc(replyPartsTable.position))
      .all();
  }

  findByIdentity(chat: string, turn: string, identity: string, first = false): PartRow[] {
    const match = and(
      eq(replyPartsTable.chatUri, chat),
      eq(replyPartsTable.turnId, turn),
      eq(replyPartsTable.identity, identity),
    );

    const query = this.db
      .select()
      .from(replyPartsTable)
      .where(match)
      .orderBy(asc(replyPartsTable.position));

    return first ? query.limit(1).all() : query.all();
  }

  readUnfinishedToolCalls(chat: string, turn: string): PartRow[] {
    const match = and(
      eq(replyPartsTable.chatUri, chat),
      eq(replyPartsTable.turnId, turn),
      eq(replyPartsTable.kind, "toolCall"),
      inArray(replyPartsTable.status, [
        "streaming",
        "running",
        "pending-confirmation",
        "pending-result-confirmation",
        "auth-required",
      ]),
    );

    return this.db.select().from(replyPartsTable).where(match).all();
  }

  readLastTextIdentity(chat: string, turn: string, count: number): TextPartIdentity | undefined {
    const match = and(
      eq(replyPartsTable.chatUri, chat),
      eq(replyPartsTable.turnId, turn),
      eq(replyPartsTable.position, count - 1),
    );

    const row = this.db
      .select({ kind: replyPartsTable.kind, identity: replyPartsTable.identity })
      .from(replyPartsTable)
      .where(match)
      .get();

    if (row && row.identity !== null && (row.kind === "markdown" || row.kind === "reasoning")) {
      return { kind: row.kind, id: row.identity };
    }

    return void 0;
  }

  readWithText(chat: string, turn: string): ResponsePart[] {
    return this.readRows(chat, turn).map((row) => {
      const part = this.parseMetadata(row);

      if (part.kind !== "markdown" && part.kind !== "reasoning") {
        return part;
      }

      const match = and(
        eq(textPiecesTable.chatUri, chat),
        eq(textPiecesTable.turnId, turn),
        eq(textPiecesTable.position, row.position),
      );

      const pieces = this.db
        .select({ data: textPiecesTable.text })
        .from(textPiecesTable)
        .where(match)
        .orderBy(asc(textPiecesTable.piece))
        .all();

      return { ...part, content: Array.from(pieces, readPiece).join("") };
    });
  }

  insert(chat: string, turn: string, position: number, part: ResponsePart): void {
    this.insertPart({ chat, turn, position, part });
  }

  private insertPart({ chat, turn, position, part }: InsertPartParams): void {
    const text = part.kind === "markdown" || part.kind === "reasoning" ? part.content : void 0;
    const metadata = JSON.stringify(text === void 0 ? part : { ...part, content: "" });
    checkBytes(
      new TextEncoder().encode(metadata).byteLength,
      MAX_PART_METADATA_BYTES,
      "Reply part metadata exceeds the storage budget",
    );

    let identity: string | null = null;

    if (part.kind === "toolCall") {
      identity = part.toolCall.toolCallId;
    } else if (part.kind === "inputRequest") {
      identity = part.request.id;
    } else if ("id" in part) {
      identity = part.id;
    }

    const status = part.kind === "toolCall" ? part.toolCall.status : null;
    this.db
      .insert(replyPartsTable)
      .values({
        chatUri: chat,
        turnId: turn,
        position,
        identity,
        kind: part.kind,
        status,
        metadata,
        bytes: encodedSize(part),
        pieces: 0,
      })
      .run();

    if (text !== void 0) {
      this.appendPieces({ chat, turn, position, start: 0, text });
    }

    const match = and(eq(turnRecordsTable.chatUri, chat), eq(turnRecordsTable.turnId, turn));

    this.db
      .update(turnRecordsTable)
      .set({
        bytes: sql`${turnRecordsTable.bytes} + ${encodedSize(part) + 1}`,
        partCount: sql`${turnRecordsTable.partCount} + 1`,
        blockingCount: sql`${turnRecordsTable.blockingCount} + ${blocking(part)}`,
        inputCount: sql`${turnRecordsTable.inputCount} + ${openInput(part)}`,
      })
      .where(match)
      .run();
  }

  replace(chat: string, turn: string, row: PartRow, part: ResponsePart): void {
    const bytes = encodedSize(part);
    checkBytes(bytes, MAX_PART_METADATA_BYTES, "Reply part metadata exceeds the storage budget");
    const previous = this.parseMetadata(row);

    const match = and(
      eq(replyPartsTable.chatUri, chat),
      eq(replyPartsTable.turnId, turn),
      eq(replyPartsTable.position, row.position),
    );

    this.db
      .update(replyPartsTable)
      .set({
        metadata: JSON.stringify(part),
        bytes,
        status: part.kind === "toolCall" ? part.toolCall.status : null,
      })
      .where(match)
      .run();

    const turnMatch = and(eq(turnRecordsTable.chatUri, chat), eq(turnRecordsTable.turnId, turn));

    this.db
      .update(turnRecordsTable)
      .set({
        bytes: sql`${turnRecordsTable.bytes} + ${bytes - row.bytes}`,
        blockingCount: sql`${turnRecordsTable.blockingCount} + ${blocking(part) - blocking(previous)}`,
        inputCount: sql`${turnRecordsTable.inputCount} + ${openInput(part) - openInput(previous)}`,
      })
      .where(turnMatch)
      .run();
  }

  appendText(chat: string, turn: string, row: PartRow, text: string): void {
    const bytes = encodedSize(text) - STRING_QUOTES;
    this.appendPieces({ chat, turn, position: row.position, start: row.pieces, text });

    const match = and(
      eq(replyPartsTable.chatUri, chat),
      eq(replyPartsTable.turnId, turn),
      eq(replyPartsTable.position, row.position),
    );

    this.db
      .update(replyPartsTable)
      .set({ bytes: sql`${replyPartsTable.bytes} + ${bytes}` })
      .where(match)
      .run();

    const turnMatch = and(eq(turnRecordsTable.chatUri, chat), eq(turnRecordsTable.turnId, turn));

    this.db
      .update(turnRecordsTable)
      .set({ bytes: sql`${turnRecordsTable.bytes} + ${bytes}` })
      .where(turnMatch)
      .run();
  }

  private appendPieces({ chat, turn, position, start, text }: AppendPiecesParams): void {
    let piece = start;

    for (let offset = 0; offset < text.length;) {
      const end = pieceEnd(text, offset, JSON_PIECE_CHARACTERS);
      const data = JSON.stringify(text.slice(offset, end));
      this.db
        .insert(textPiecesTable)
        .values({ chatUri: chat, turnId: turn, position, piece, text: data })
        .run();
      offset = end;
      piece += 1;
    }

    const match = and(
      eq(replyPartsTable.chatUri, chat),
      eq(replyPartsTable.turnId, turn),
      eq(replyPartsTable.position, position),
    );

    this.db.update(replyPartsTable).set({ pieces: piece }).where(match).run();
  }

  deleteTurnRecords(chat: string, turn?: string): void {
    for (const table of [replyPartsTable, textPiecesTable, turnRecordsTable]) {
      const match = and(eq(table.chatUri, chat), turn === void 0 ? void 0 : eq(table.turnId, turn));

      this.db.delete(table).where(match).run();
    }
  }
}

export {
  Parts,
  encodedSize,
  pieceEnd,
  readPiece,
  JSON_PIECE_CHARACTERS,
  type StoredPiece,
  type PartRow,
};
