import {
  ToolResultContentType as AHPToolResultContentType,
  type StringOrMarkdown as AHPStringOrMarkdown,
  type ToolInput as AHPToolInput,
  type ToolResultContent as AHPToolResultContent,
} from "@microsoft/agent-host-protocol";

const JSON_INDENT = 2;

type MarkdownValue = { markdown: string };

function isMarkdownValue(value: AHPStringOrMarkdown): value is MarkdownValue {
  return typeof value !== "string";
}

function isInlineInput(input: AHPToolInput): input is string {
  return typeof input === "string";
}

/** Returns markdown source unchanged, without removing its formatting. */
export function plainText(value: AHPStringOrMarkdown): string {
  return isMarkdownValue(value) ? value.markdown : value;
}

/**
 * Inline input usually contains JSON. If parsing fails, the display keeps the original text.
 * Referenced input displays its URI instead of loading the content.
 */
export function toolInputText(input: AHPToolInput | undefined): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (!isInlineInput(input)) {
    return input.uri;
  }

  try {
    const parsed: unknown = JSON.parse(input);

    return JSON.stringify(parsed, null, JSON_INDENT);
  } catch {
    return input;
  }
}

export function contentText(content: AHPToolResultContent[] | undefined): string | undefined {
  let text = "";

  for (const block of content ?? []) {
    if (block.type === AHPToolResultContentType.Text) {
      text += block.text;
    }
  }

  return text === "" ? undefined : text;
}
