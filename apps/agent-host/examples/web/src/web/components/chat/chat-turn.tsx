import {
  MessageAttachmentKind as AHPMessageAttachmentKind,
  ResponsePartKind as AHPResponsePartKind,
  TurnState as AHPTurnState,
  type ActiveTurn as AHPActiveTurn,
  type Message as AHPMessage,
  type MessageAttachment as AHPMessageAttachment,
  type ResponsePart as AHPResponsePart,
  type Turn as AHPTurn,
} from "@microsoft/agent-host-protocol";
import type { ReactElement } from "react";

import type { AhpChatPhase } from "~/lib/ahp/chat-phase";

import { ResponsePartView } from "./response-part";

/** The offset of the last part of a turn. */
const LAST_PART = -1;

type ChatTurnProps = {
  turn: AHPTurn | AHPActiveTurn;
  /**
   * The interaction phase of the chat. A turn that has ended reports `idle`.
   */
  phase: AhpChatPhase;
  onConfirmToolCall(turnId: string, toolCallId: string, approved: boolean): void;
  onConfirmToolResult(turnId: string, toolCallId: string, approved: boolean): void;
};

type AttachmentViewParams = {
  attachment: AHPMessageAttachment;
};

/** Renders one attachment as a labelled reference. */
function AttachmentView({ attachment }: AttachmentViewParams): ReactElement {
  const reference =
    attachment.type === AHPMessageAttachmentKind.Resource ? attachment.uri : attachment.label;

  return <span className="text-sm text-neutral-600 wrap-anywhere">📎 {reference}</span>;
}

type UserMessageParams = {
  message: AHPMessage;
};

/** Renders the message that started a turn as a user bubble. */
function UserMessage({ message }: UserMessageParams): ReactElement {
  const attachments = message.attachments ?? [];

  return (
    <div className="flex min-w-0 justify-end">
      <div className="max-w-2xl min-w-0 rounded-md border border-neutral-300 px-4 py-3">
        <div className="grid min-w-0 gap-2">
          {message.text.length === 0 ? null : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">
              {message.text}
            </p>
          )}
          {attachments.map((attachment, index) => (
            <AttachmentView key={`${message.text}:${String(index)}`} attachment={attachment} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Reports whether a part shows its own progress while the turn streams.
 *
 * Markdown and reasoning parts render a caret, so the turn needs no other
 * indicator while one of them is the last part.
 */
function isLivePart(part: AHPResponsePart | undefined): boolean {
  return (
    part?.kind === AHPResponsePartKind.Markdown || part?.kind === AHPResponsePartKind.Reasoning
  );
}

/**
 * Renders a progress indicator for a turn that works without visible output.
 *
 * The indicator covers the time before the first token of a response and the
 * time the agent spends between tool calls.
 */
function ProcessingIndicator(): ReactElement {
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-neutral-500">
      <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-neutral-400" />
      Agent is working
    </div>
  );
}

/**
 * Renders one AHP turn.
 *
 * The turn carries the user message and the ordered response parts, so the
 * component reads the protocol state without an intermediate message model.
 */
export function ChatTurn({
  turn,
  phase,
  onConfirmToolCall,
  onConfirmToolResult,
}: ChatTurnProps): ReactElement {
  const parts = turn.responseParts;
  const streaming = phase === "streaming";
  // A waiting turn is blocked on the user, and an idle turn has ended.
  const processing = streaming && !isLivePart(parts.at(LAST_PART));

  return (
    <div className="grid min-w-0 gap-4">
      <UserMessage message={turn.message} />
      <div className="grid min-w-0 gap-2">
        {"state" in turn && turn.state === AHPTurnState.Cancelled ? (
          <span className="text-xs text-neutral-500">Stopped</span>
        ) : null}
        {parts.map((part, index) => (
          <ResponsePartView
            key={`${turn.id}:${String(index)}`}
            part={part}
            streaming={streaming && index === parts.length - 1}
            onConfirmToolCall={(toolCallId: string, approved: boolean): void => {
              onConfirmToolCall(turn.id, toolCallId, approved);
            }}
            onConfirmToolResult={(toolCallId: string, approved: boolean): void => {
              onConfirmToolResult(turn.id, toolCallId, approved);
            }}
          />
        ))}
        {processing ? <ProcessingIndicator /> : null}
      </div>
    </div>
  );
}
