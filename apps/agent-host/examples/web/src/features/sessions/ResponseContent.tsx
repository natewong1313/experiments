import * as z from "zod";
import type { JSX } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { WrenchIcon } from "@phosphor-icons/react";
import type { ResponsePart } from "@experiments/protocol-schemas/ahp";

const NotificationTextSchema = z.string();

const NotificationMarkdownSchema = z.object({ markdown: z.string() });

type ResponseContentParams = { part: ResponsePart };

function ResponseContent({ part }: ResponseContentParams): JSX.Element {
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
        <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          <WrenchIcon size={14} aria-hidden="true" />
          <span className="font-medium">{part.toolCall.toolName}</span>
          <span aria-hidden="true">·</span>
          <span>{part.toolCall.status}</span>
        </div>
      );
    }

    case "contentRef": {
      return <p className="m-0 text-sm text-muted-foreground">Resource: {part.uri}</p>;
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

export { ResponseContent };
