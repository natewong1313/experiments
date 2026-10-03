import {
  TextResourceContentsSchema,
  BlobResourceContentsSchema,
  type ContentBlock,
  type ToolCallContent,
} from "./generated";
import type { ToolResultContent } from "../ahp/channels/chat/tool-call";
import type { ContentRef } from "../ahp/common";

function textReference(text: string): ContentRef {
  return {
    uri: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`,
    contentType: "text/plain",
  };
}

type ReferencedContent = Exclude<ContentBlock, { type: "text" }>;

function contentReference(content: ReferencedContent): ContentRef {
  switch (content.type) {
    case "image":
    case "audio": {
      return {
        uri: `data:${content.mimeType};base64,${content.data}`,
        contentType: content.mimeType,
      };
    }

    case "resource_link": {
      return {
        uri: content.uri,
        contentType: content.mimeType ?? void 0,
        sizeHint: content.size ?? void 0,
      };
    }

    case "resource": {
      const text = TextResourceContentsSchema.safeParse(content.resource);

      if (text.success) {
        return textReference(text.data.text);
      }

      const blob = BlobResourceContentsSchema.parse(content.resource);
      const mimeType = blob.mimeType ?? "application/octet-stream";

      return { uri: `data:${mimeType};base64,${blob.blob}`, contentType: mimeType };
    }

    default: {
      const exhaustive: never = content;

      return exhaustive;
    }
  }
}

function contentText(content: ContentBlock): string {
  if (content.type === "text") {
    return content.text;
  }

  if (content.type === "resource_link") {
    return content.title ?? content.name;
  }

  if (content.type === "resource") {
    const text = TextResourceContentsSchema.safeParse(content.resource);

    return text.success ? text.data.text : content.resource.uri;
  }

  return `[${content.type}: ${content.mimeType}]`;
}

function toolContent(item: ToolCallContent): ToolResultContent[] {
  switch (item.type) {
    case "content": {
      return item.content.type === "text"
        ? [{ type: "text", text: item.content.text }]
        : [{ type: "resource", ...contentReference(item.content) }];
    }

    case "diff": {
      const file = new URL("file:///");
      file.pathname = item.path;

      return [
        {
          type: "fileEdit",
          before:
            item.oldText === null || item.oldText === void 0
              ? void 0
              : { uri: file.href, content: textReference(item.oldText) },
          after: { uri: file.href, content: textReference(item.newText) },
        },
      ];
    }

    case "terminal": {
      return [
        {
          type: "terminal",
          resource: `acp-terminal:/${encodeURIComponent(item.terminalId)}`,
          title: item.terminalId,
        },
      ];
    }

    default: {
      const exhaustive: never = item;

      return exhaustive;
    }
  }
}

export { contentReference, contentText, toolContent };
