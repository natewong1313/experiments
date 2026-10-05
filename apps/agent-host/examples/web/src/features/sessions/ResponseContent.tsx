import * as z from "zod";
import { memo, type JSX } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { WrenchIcon } from "@phosphor-icons/react";
import {
  ContentRefSchema,
  type ToolInput,
  type ToolResultContent,
  type ResponsePart,
} from "@experiments/protocol-schemas/ahp";

import { StoredContent } from "./StoredContent";

const ABSENT = void 0;

const contentIdentities: WeakMap<ToolResultContent, string> = new WeakMap();

function contentIdentity(item: ToolResultContent): string {
  const existing = contentIdentities.get(item);

  if (existing !== ABSENT) {
    return existing;
  }

  const key = crypto.randomUUID();
  contentIdentities.set(item, key);

  return key;
}

const NotificationTextSchema = z.string();

const NotificationMarkdownSchema = z.object({ markdown: z.string() });

type ResponseContentParams = { part: ResponsePart };

function renderInput(input: ToolInput): JSX.Element {
  const text = z.string().safeParse(input);

  if (text.success) {
    return <pre className="max-h-96 overflow-auto whitespace-pre-wrap">{text.data}</pre>;
  }

  const reference = ContentRefSchema.parse(input);

  return <StoredContent key={reference.uri} reference={reference} />;
}

function ResponseContentView({ part }: ResponseContentParams): JSX.Element {
  switch (part.kind) {
    case "markdown": {
      return <p className="m-0 whitespace-pre-wrap leading-relaxed">{part.content}</p>;
    }

    case "reasoning": {
      return (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Reasoning</summary>
          <p className="mb-0 mt-2 whitespace-pre-wrap text-muted-foreground">{part.content}</p>
        </details>
      );
    }

    case "error": {
      return (
        <Alert variant="destructive">
          <AlertTitle>Agent error</AlertTitle>
          <AlertDescription>{part.error.message}</AlertDescription>
        </Alert>
      );
    }

    case "toolCall": {
      return (
        <div className="grid gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          <WrenchIcon size={14} aria-hidden="true" />
          <span className="font-medium">{part.toolCall.toolName}</span>
          <span aria-hidden="true">·</span>
          <span>{part.toolCall.status}</span>
          {"toolInput" in part.toolCall && part.toolCall.toolInput !== ABSENT && (
            <details>
              <summary>Input</summary>
              {renderInput(part.toolCall.toolInput)}
            </details>
          )}
          {"content" in part.toolCall &&
            part.toolCall.content?.map((item) => {
              if (item.type === "resource") {
                return <StoredContent key={item.uri} reference={item} />;
              }

              if (item.type === "text") {
                return (
                  <pre
                    key={contentIdentity(item)}
                    className="max-h-96 overflow-auto whitespace-pre-wrap"
                  >
                    {item.text}
                  </pre>
                );
              }

              if (item.type === "fileEdit" && item.after) {
                return (
                  <StoredContent key={item.after.content.uri} reference={item.after.content} />
                );
              }

              return null;
            })}
        </div>
      );
    }

    case "contentRef": {
      return <StoredContent key={part.uri} reference={part} />;
    }

    case "systemNotification": {
      const text = NotificationTextSchema.safeParse(part.content);

      const content = text.success
        ? text.data
        : NotificationMarkdownSchema.parse(part.content).markdown;

      return <p className="m-0 whitespace-pre-wrap text-sm text-muted-foreground">{content}</p>;
    }

    case "inputRequest": {
      return (
        <p className="m-0 text-sm text-muted-foreground">
          The agent requested input. Interactive input is not available in this example.
        </p>
      );
    }

    default: {
      const exhaustive: never = part;
      throw new Error(`Unknown response part: ${String(exhaustive)}`);
    }
  }
}

const ResponseContent = memo(ResponseContentView);

export { ResponseContent };
