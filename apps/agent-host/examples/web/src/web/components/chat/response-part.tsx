import {
  ChatInputResponseKind as AHPChatInputResponseKind,
  ResponsePartKind as AHPResponsePartKind,
  type ChatInputRequest as AHPChatInputRequest,
  type ResponsePart as AHPResponsePart,
} from "@microsoft/agent-host-protocol";
import type { ReactElement } from "react";

import { plainText } from "~/lib/ahp/display";

import { ReasoningPart } from "./reasoning-part";
import { ToolCallView } from "./tool-call";

type ResponsePartViewProps = {
  part: AHPResponsePart;
  /** Whether the part is still receiving content. */
  streaming: boolean;
  onConfirmToolCall(toolCallId: string, approved: boolean): void;
  onConfirmToolResult(toolCallId: string, approved: boolean): void;
};

type MarkdownPartParams = {
  content: string;
  streaming: boolean;
};

/** Renders markdown text, with a caret while the part is still streaming. */
function MarkdownPart({ content, streaming }: MarkdownPartParams): ReactElement {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">
      {content}
      {streaming ? <span className="animate-pulse text-neutral-400">▍</span> : null}
    </p>
  );
}

type ContentRefPartParams = {
  uri: string;
};

/** Renders a content reference by its URI. */
function ContentRefPart({ uri }: ContentRefPartParams): ReactElement {
  return <span className="text-sm text-neutral-600 wrap-anywhere">📎 {uri}</span>;
}

/** Reads the label of a resolved input request. */
function responseLabel(response: AHPChatInputResponseKind | undefined): string {
  switch (response) {
    case AHPChatInputResponseKind.Accept: {
      return "Accepted";
    }

    case AHPChatInputResponseKind.Decline: {
      return "Declined";
    }

    case AHPChatInputResponseKind.Cancel: {
      return "Cancelled";
    }

    case undefined: {
      return "Waiting";
    }
  }
}

type InputRequestPartParams = {
  request: AHPChatInputRequest;
  response: AHPChatInputResponseKind | undefined;
};

/** Renders a request that the agent is waiting on. */
function InputRequestPart({ request, response }: InputRequestPartParams): ReactElement {
  return (
    <div className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{request.message ?? "The agent is waiting for input"}</span>
        <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs">
          {responseLabel(response)}
        </span>
      </div>
      {request.url === undefined ? null : (
        <p className="mt-1 text-neutral-600 wrap-anywhere">{request.url}</p>
      )}
      <ul className="mt-1 grid gap-1">
        {(request.questions ?? []).map((question) => (
          <li key={question.id} className="text-neutral-600 wrap-anywhere">
            {question.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Renders one AHP response part.
 *
 * The switch follows the protocol part kinds, so a part that the host adds
 * later renders nothing rather than failing.
 */
export function ResponsePartView({
  part,
  streaming,
  onConfirmToolCall,
  onConfirmToolResult,
}: ResponsePartViewProps): ReactElement | null {
  switch (part.kind) {
    case AHPResponsePartKind.Markdown: {
      return <MarkdownPart content={part.content} streaming={streaming} />;
    }

    case AHPResponsePartKind.Reasoning: {
      return <ReasoningPart text={part.content} streaming={streaming} />;
    }

    case AHPResponsePartKind.ToolCall: {
      return (
        <ToolCallView
          toolCall={part.toolCall}
          onConfirm={(approved: boolean): void => {
            onConfirmToolCall(part.toolCall.toolCallId, approved);
          }}
          onConfirmResult={(approved: boolean): void => {
            onConfirmToolResult(part.toolCall.toolCallId, approved);
          }}
        />
      );
    }

    case AHPResponsePartKind.ContentRef: {
      return <ContentRefPart uri={part.uri} />;
    }

    case AHPResponsePartKind.SystemNotification: {
      return <p className="text-sm text-neutral-600 wrap-anywhere">{plainText(part.content)}</p>;
    }

    case AHPResponsePartKind.InputRequest: {
      return <InputRequestPart request={part.request} response={part.response} />;
    }

    case AHPResponsePartKind.Error: {
      return (
        <div className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <p className="text-red-600 wrap-anywhere">{part.error.message}</p>
          {part.resumable === true ? (
            <p className="mt-1 text-xs text-neutral-500">The turn can be resumed.</p>
          ) : null}
        </div>
      );
    }
  }
}
