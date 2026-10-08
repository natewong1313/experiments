import * as z from "zod";
import {
  ContentRefSchema,
  type metaSchema,
  type ToolInput,
  type ToolResultContent,
  type ResponsePart,
  type ContentRef,
  type StateAction,
} from "@experiments/protocol-schemas/ahp";
import { ProtocolError, RpcCodes } from "../../ahp/protocol";
import { encodedSize } from "../persistence/encoding";
import type { ResourceStore, ContentEncoding } from "./resource-store";

const INLINE_BYTES = 8192;
const MISSING_INDEX = -1;
const DATA_PREFIX = "data:";

type Metadata = z.output<typeof metaSchema>;

export class ActionContent {
  private readonly resources: ResourceStore;

  constructor(resources: ResourceStore) {
    this.resources = resources;
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

      const ref = this.resources.createResource(chat, data, contentType, encoding);
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
}
