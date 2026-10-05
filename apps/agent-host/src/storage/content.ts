import * as z from "zod";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import { chats, contents, contentPieces } from "./schema";
import {
  type metaSchema,
  ContentRefSchema,
  type ToolInput,
  type ToolResultContent,
  type ResponsePart,
  type ContentRef,
  type StateAction,
  type ResourceReadResult,
} from "@experiments/protocol-schemas/ahp";
import { checkBytes } from "../memory";
import { ProtocolError, RpcCodes } from "../ahp/protocol";
import { encodedSize, pieceEnd, readPiece, JSON_PIECE_CHARACTERS } from "./parts";

const INLINE_BYTES = 8192;

const RESOURCE_BYTES = 1_048_576;

const RESPONSE_OVERHEAD_BYTES = 4096;

const SESSION_CONTENT_BYTES = 67_108_864;

const PIECE_CHARACTERS = 16_384;

type ContentEncoding = typeof contents.$inferSelect.encoding;

type Database = ReturnType<typeof drizzle>;

type Metadata = z.output<typeof metaSchema>;

const MISSING_INDEX = -1;

const DATA_PREFIX = "data:";

class ContentStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  storeActionContent(chat: string, actions: StateAction[]): StateAction[] {
    const references: Map<string, ContentRef> = new Map();

    const store = (
      data: string,
      contentType: string,
      encoding: ContentEncoding = "utf-8",
    ): ContentRef => {
      const key = JSON.stringify([contentType, encoding, data]);
      const existing = references.get(key);

      if (existing) {
        return existing;
      }

      const ref = this.createResource(chat, data, contentType, encoding);
      references.set(key, ref);

      return ref;
    };

    function metadata(value: Metadata | undefined): Metadata | undefined {
      if (value === void 0 || encodedSize(value) <= INLINE_BYTES) {
        return value;
      }

      return { contentRef: store(JSON.stringify(value), "application/json") };
    }

    function reference(ref: ContentRef): ContentRef {
      if (!ref.uri.startsWith("data:")) {
        return ref;
      }

      const comma = ref.uri.indexOf(",");

      if (comma === MISSING_INDEX) {
        throw new ProtocolError(RpcCodes.params, "Invalid content data URI");
      }

      const header = ref.uri.slice(DATA_PREFIX.length, comma);
      const base64 = header.endsWith(";base64");
      const data = ref.uri.slice(comma + 1);

      return store(
        base64 ? data : decodeURIComponent(data),
        ref.contentType ?? header.split(";")[0] ?? "application/octet-stream",
        base64 ? "base64" : "utf-8",
      );
    }

    function input(value: ToolInput | undefined): ToolInput | undefined {
      if (value === void 0) {
        return value;
      }

      const text = z.string().safeParse(value);

      if (text.success) {
        return encodedSize(text.data) > INLINE_BYTES
          ? store(text.data, "application/json")
          : text.data;
      }

      return reference(ContentRefSchema.parse(value));
    }

    function content(items: ToolResultContent[] | undefined): ToolResultContent[] | undefined {
      return items?.map((item) => {
        switch (item.type) {
          case "text": {
            return encodedSize(item.text) > INLINE_BYTES
              ? { type: "resource", ...store(item.text, "text/plain") }
              : item;
          }

          case "embeddedResource": {
            return { type: "resource", ...store(item.data, item.contentType, "base64") };
          }

          case "resource": {
            return { type: "resource", ...reference(item) };
          }

          case "fileEdit": {
            return {
              ...item,
              before: item.before
                ? { ...item.before, content: reference(item.before.content) }
                : void 0,
              after: item.after
                ? { ...item.after, content: reference(item.after.content) }
                : void 0,
            };
          }

          case "terminal":
          case "subagent": {
            return item;
          }

          default: {
            const exhaustive: never = item;

            return exhaustive;
          }
        }
      });
    }

    function part(value: ResponsePart): ResponsePart {
      if (value.kind === "contentRef") {
        return { kind: "contentRef", ...reference(value) };
      }

      if (value.kind === "systemNotification") {
        if (encodedSize(value.content) > INLINE_BYTES) {
          const text = z.string().safeParse(value.content);

          return {
            kind: "contentRef",
            ...store(text.success ? text.data : JSON.stringify(value.content), "text/plain"),
          };
        }

        return { ...value, _meta: metadata(value._meta) };
      }

      if (value.kind === "toolCall") {
        const tool = value.toolCall;

        const normalized = { ...tool, _meta: metadata(tool._meta) };

        if ("toolInput" in normalized) {
          normalized.toolInput = input(normalized.toolInput);
        }

        if ("content" in normalized) {
          normalized.content = content(normalized.content);
        }

        if ("structuredContent" in normalized) {
          normalized.structuredContent = metadata(normalized.structuredContent);
        }

        return { ...value, toolCall: normalized };
      }

      return value;
    }

    return actions.map((action) => {
      const base = "_meta" in action ? { ...action, _meta: metadata(action._meta) } : action;

      if (base.type === "chat/responsePart") {
        return { ...base, part: part(base.part) };
      }

      if (base.type === "chat/toolCallReady") {
        return { ...base, toolInput: input(base.toolInput) };
      }

      if (base.type === "chat/toolCallContentChanged") {
        return { ...base, content: content(base.content) ?? [] };
      }

      if (base.type === "chat/toolCallComplete") {
        return {
          ...base,
          result: {
            ...base.result,
            content: content(base.result.content),
            structuredContent: metadata(base.result.structuredContent),
          },
        };
      }

      return base;
    });
  }

  private createResource(
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
      .select({ contentBytes: chats.contentBytes })
      .from(chats)
      .where(eq(chats.uri, chat))
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
      .insert(contents)
      .values({ uri, chatUri: chat, contentType, encoding, bytes, retiredSeq: null })
      .run();
    let piece = 0;

    for (let offset = 0; offset < data.length;) {
      const end = pieceEnd(data, offset, JSON_PIECE_CHARACTERS);
      const stored = JSON.stringify(data.slice(offset, end));
      this.db.insert(contentPieces).values({ uri, piece, data: stored }).run();
      offset = end;
      piece += 1;
    }

    this.db
      .update(chats)
      .set({ contentBytes: sql`${chats.contentBytes} + ${bytes}` })
      .where(eq(chats.uri, chat))
      .run();

    return {
      uri,
      contentType,
      sizeHint: encoding === "base64" ? atob(data).length : bytes,
    };
  }

  readResource(uri: string, encoding?: ContentEncoding): ResourceReadResult {
    const row = this.db.select().from(contents).where(eq(contents.uri, uri)).get();

    if (!row) {
      throw new ProtocolError(
        RpcCodes.params,
        "Resource does not belong to this host or has expired",
      );
    }

    checkBytes(row.bytes, RESOURCE_BYTES, "Resource exceeds the response budget");

    const data = this.db
      .select({ data: contentPieces.data })
      .from(contentPieces)
      .where(eq(contentPieces.uri, uri))
      .orderBy(asc(contentPieces.piece))
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
    const match = and(eq(contents.chatUri, chat), isNull(contents.retiredSeq));

    this.db.update(contents).set({ retiredSeq: sequence }).where(match).run();
  }

  deleteRetiredContent(floor: number): void {
    const retired = this.db
      .select({ uri: contents.uri })
      .from(contents)
      .where(lte(contents.retiredSeq, floor));

    this.db.delete(contentPieces).where(inArray(contentPieces.uri, retired)).run();

    this.db.delete(contents).where(lte(contents.retiredSeq, floor)).run();
  }
}

export { ContentStore };
