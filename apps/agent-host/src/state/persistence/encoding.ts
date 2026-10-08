import * as z from "zod";
import type {
  metaSchema,
  ResponsePart,
  StateAction,
  ChatState,
  Turn,
  ActiveTurn,
  ContentRef,
  ResourceReadResult,
} from "@experiments/protocol-schemas/ahp";

const PIECE_CHARACTERS = 16_384;
export const JSON_PIECE_CHARACTERS = 8192;
const HIGH_SURROGATE_START = 0xd8_00;
const HIGH_SURROGATE_END = 0xdb_ff;

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

export function encodedSize(value: StoredValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function pieceEnd(text: string, offset: number, limit = PIECE_CHARACTERS): number {
  const end = Math.min(offset + limit, text.length);
  const last = text.charCodeAt(end - 1);

  return end < text.length && last >= HIGH_SURROGATE_START && last <= HIGH_SURROGATE_END
    ? end - 1
    : end;
}

type StoredPiece = { data: string };

export function readPiece(piece: StoredPiece): string {
  const text: unknown = JSON.parse(piece.data);

  return z.string().parse(text);
}
