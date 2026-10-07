import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { chatsTable, contentsTable, contentPiecesTable } from "../persistence/schema";
import type { ContentRef, ResourceReadResult } from "@experiments/protocol-schemas/ahp";
import { checkBytes } from "../../memory";
import { ProtocolError, RpcCodes } from "../../ahp/protocol";
import { encodedSize, pieceEnd, readPiece, JSON_PIECE_CHARACTERS } from "../persistence/encoding";
import type { Database } from "../persistence/database";

const RESOURCE_BYTES = 1_048_576;

const RESPONSE_OVERHEAD_BYTES = 4096;

const SESSION_CONTENT_BYTES = 67_108_864;

const PIECE_CHARACTERS = 16_384;

type ContentEncoding = typeof contentsTable.$inferSelect.encoding;

class ResourceStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  createResource(
    chat: string,
    data: string,
    contentType: string,
    encoding: ContentEncoding,
  ): ContentRef {
    const bytes = new TextEncoder().encode(data).byteLength;
    checkBytes(
      encodedSize({ data, encoding, contentType }),
      RESOURCE_BYTES - RESPONSE_OVERHEAD_BYTES,
      "Content exceeds the resource response budget",
    );

    const owner = this.db
      .select({ contentBytes: chatsTable.contentBytes })
      .from(chatsTable)
      .where(eq(chatsTable.uri, chat))
      .get();

    if (!owner) {
      throw new Error("Chat does not exist");
    }

    checkBytes(
      owner.contentBytes + bytes,
      SESSION_CONTENT_BYTES,
      "Session content exceeds the storage budget",
    );
    const uri = `ahp-content:/${crypto.randomUUID()}`;
    this.db
      .insert(contentsTable)
      .values({ uri, chatUri: chat, contentType, encoding, bytes, retiredSeq: null })
      .run();
    let piece = 0;

    for (let offset = 0; offset < data.length;) {
      const end = pieceEnd(data, offset, JSON_PIECE_CHARACTERS);
      const stored = JSON.stringify(data.slice(offset, end));
      this.db.insert(contentPiecesTable).values({ uri, piece, data: stored }).run();
      offset = end;
      piece += 1;
    }

    this.db
      .update(chatsTable)
      .set({ contentBytes: sql`${chatsTable.contentBytes} + ${bytes}` })
      .where(eq(chatsTable.uri, chat))
      .run();

    return {
      uri,
      contentType,
      sizeHint: encoding === "base64" ? atob(data).length : bytes,
    };
  }

  readResource(uri: string, encoding?: ContentEncoding): ResourceReadResult {
    const row = this.db.select().from(contentsTable).where(eq(contentsTable.uri, uri)).get();

    if (!row) {
      throw new ProtocolError(
        RpcCodes.params,
        "Resource does not belong to this host or has expired",
      );
    }

    checkBytes(row.bytes, RESOURCE_BYTES, "Resource exceeds the response budget");

    const data = this.db
      .select({ data: contentPiecesTable.data })
      .from(contentPiecesTable)
      .where(eq(contentPiecesTable.uri, uri))
      .orderBy(asc(contentPiecesTable.piece))
      .all()
      .map((piece) => readPiece(piece))
      .join("");

    const preferred = encoding ?? row.encoding;

    if (preferred === row.encoding) {
      return this.checkResponseBudget({ data, encoding: preferred, contentType: row.contentType });
    }

    if (preferred === "utf-8") {
      const binary = atob(data);

      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

      return this.checkResponseBudget({
        data: new TextDecoder().decode(bytes),
        encoding: preferred,
        contentType: row.contentType,
      });
    }

    const bytes = new TextEncoder().encode(data);
    const parts: string[] = [];

    for (let offset = 0; offset < bytes.length; offset += PIECE_CHARACTERS) {
      const piece = bytes.subarray(offset, offset + PIECE_CHARACTERS);
      parts.push(String.fromCharCode(...piece));
    }

    const base64 = btoa(parts.join(""));
    checkBytes(base64.length, RESOURCE_BYTES, "Resource exceeds the requested encoding budget");

    return this.checkResponseBudget({
      data: base64,
      encoding: preferred,
      contentType: row.contentType,
    });
  }

  private checkResponseBudget(result: ResourceReadResult): ResourceReadResult {
    checkBytes(
      encodedSize(result),
      RESOURCE_BYTES - RESPONSE_OVERHEAD_BYTES,
      "Resource exceeds the requested encoding budget",
    );

    return result;
  }

  retireChatContent(chat: string, sequence: number): void {
    const match = and(eq(contentsTable.chatUri, chat), isNull(contentsTable.retiredSeq));

    this.db.update(contentsTable).set({ retiredSeq: sequence }).where(match).run();
  }

  deleteRetiredContent(floor: number): void {
    const retired = this.db
      .select({ uri: contentsTable.uri })
      .from(contentsTable)
      .where(lte(contentsTable.retiredSeq, floor));

    this.db.delete(contentPiecesTable).where(inArray(contentPiecesTable.uri, retired)).run();

    this.db.delete(contentsTable).where(lte(contentsTable.retiredSeq, floor)).run();
  }
}

export { ResourceStore, type ContentEncoding };
