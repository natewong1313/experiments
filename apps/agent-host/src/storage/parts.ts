import * as z from "zod";
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

type PartRow = {
  position: number;
  identity: string | null;
  kind: string;
  status: string | null;
  metadata: string;
  bytes: number;
  pieces: number;
};

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
  private readonly sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  parseMetadata(row: PartRow): ResponsePart {
    return ResponsePartSchema.parse(JSON.parse(row.metadata));
  }

  readRows(chat: string, turn: string): PartRow[] {
    return this.sql
      .exec<PartRow>(
        "SELECT * FROM reply_parts WHERE chat_uri = ? AND turn_id = ? ORDER BY position",
        chat,
        turn,
      )
      .toArray();
  }

  findByIdentity(chat: string, turn: string, identity: string, first = false): PartRow[] {
    return this.sql
      .exec<PartRow>(
        `SELECT * FROM reply_parts WHERE chat_uri = ? AND turn_id = ? AND identity = ? ORDER BY position${first ? " LIMIT 1" : ""}`,
        chat,
        turn,
        identity,
      )
      .toArray();
  }

  readUnfinishedToolCalls(chat: string, turn: string): PartRow[] {
    return this.sql
      .exec<PartRow>(
        "SELECT * FROM reply_parts WHERE chat_uri = ? AND turn_id = ? AND kind = 'toolCall' AND status IN ('streaming', 'running', 'pending-confirmation', 'pending-result-confirmation', 'auth-required')",
        chat,
        turn,
      )
      .toArray();
  }

  readLastTextIdentity(chat: string, turn: string, count: number): TextPartIdentity | undefined {
    const row = this.sql
      .exec<{ kind: string; identity: string | null }>(
        "SELECT kind, identity FROM reply_parts WHERE chat_uri = ? AND turn_id = ? AND position = ?",
        chat,
        turn,
        count - 1,
      )
      .next().value;

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

      const pieces = this.sql.exec<StoredPiece>(
        "SELECT text AS data FROM text_pieces WHERE chat_uri = ? AND turn_id = ? AND position = ? ORDER BY piece",
        chat,
        turn,
        row.position,
      );

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
    this.sql.exec(
      "INSERT INTO reply_parts VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
      chat,
      turn,
      position,
      identity,
      part.kind,
      status,
      metadata,
      encodedSize(part),
    );

    if (text !== void 0) {
      this.appendPieces({ chat, turn, position, start: 0, text });
    }

    this.sql.exec(
      "UPDATE turn_records SET bytes = bytes + ?, part_count = part_count + 1, blocking_count = blocking_count + ?, input_count = input_count + ? WHERE chat_uri = ? AND turn_id = ?",
      encodedSize(part) + 1,
      blocking(part),
      openInput(part),
      chat,
      turn,
    );
  }

  replace(chat: string, turn: string, row: PartRow, part: ResponsePart): void {
    const bytes = encodedSize(part);
    checkBytes(bytes, MAX_PART_METADATA_BYTES, "Reply part metadata exceeds the storage budget");
    const previous = this.parseMetadata(row);
    this.sql.exec(
      "UPDATE reply_parts SET metadata = ?, bytes = ?, status = ? WHERE chat_uri = ? AND turn_id = ? AND position = ?",
      JSON.stringify(part),
      bytes,
      part.kind === "toolCall" ? part.toolCall.status : null,
      chat,
      turn,
      row.position,
    );
    this.sql.exec(
      "UPDATE turn_records SET bytes = bytes + ?, blocking_count = blocking_count + ?, input_count = input_count + ? WHERE chat_uri = ? AND turn_id = ?",
      bytes - row.bytes,
      blocking(part) - blocking(previous),
      openInput(part) - openInput(previous),
      chat,
      turn,
    );
  }

  appendText(chat: string, turn: string, row: PartRow, text: string): void {
    const bytes = encodedSize(text) - STRING_QUOTES;
    this.appendPieces({ chat, turn, position: row.position, start: row.pieces, text });
    this.sql.exec(
      "UPDATE reply_parts SET bytes = bytes + ? WHERE chat_uri = ? AND turn_id = ? AND position = ?",
      bytes,
      chat,
      turn,
      row.position,
    );
    this.sql.exec(
      "UPDATE turn_records SET bytes = bytes + ? WHERE chat_uri = ? AND turn_id = ?",
      bytes,
      chat,
      turn,
    );
  }

  private appendPieces({ chat, turn, position, start, text }: AppendPiecesParams): void {
    let piece = start;

    for (let offset = 0; offset < text.length;) {
      const end = pieceEnd(text, offset, JSON_PIECE_CHARACTERS);
      const data = JSON.stringify(text.slice(offset, end));
      this.sql.exec(
        "INSERT INTO text_pieces VALUES (?, ?, ?, ?, ?)",
        chat,
        turn,
        position,
        piece,
        data,
      );
      offset = end;
      piece += 1;
    }

    this.sql.exec(
      "UPDATE reply_parts SET pieces = ? WHERE chat_uri = ? AND turn_id = ? AND position = ?",
      piece,
      chat,
      turn,
      position,
    );
  }

  deleteTurnRecords(chat: string, turn?: string): void {
    for (const table of ["reply_parts", "text_pieces", "turn_records"]) {
      if (turn === void 0) {
        this.sql.exec(`DELETE FROM ${table} WHERE chat_uri = ?`, chat);
      } else {
        this.sql.exec(`DELETE FROM ${table} WHERE chat_uri = ? AND turn_id = ?`, chat, turn);
      }
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
