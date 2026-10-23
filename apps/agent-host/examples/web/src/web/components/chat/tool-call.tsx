import {
  ToolCallCancellationReason as AHPToolCallCancellationReason,
  ToolCallStatus as AHPToolCallStatus,
  type ToolCallState as AHPToolCallState,
} from "@microsoft/agent-host-protocol";
import type { ReactElement } from "react";
import * as z from "zod";

import { contentText, plainText, toolInputText } from "~/lib/ahp/display";

/** The label a tool call status shows next to the tool name. */
const STATE_LABELS: Record<AHPToolCallStatus, string> = {
  [AHPToolCallStatus.Streaming]: "Preparing",
  [AHPToolCallStatus.PendingConfirmation]: "Needs approval",
  [AHPToolCallStatus.Running]: "Running",
  [AHPToolCallStatus.AuthRequired]: "Needs authentication",
  [AHPToolCallStatus.PendingResultConfirmation]: "Needs result approval",
  [AHPToolCallStatus.Completed]: "Done",
  [AHPToolCallStatus.Cancelled]: "Cancelled",
};

type ToolCallViewProps = {
  toolCall: AHPToolCallState;
  /** Approves or denies a tool call that is waiting for confirmation. */
  onConfirm(approved: boolean): void;
  /** Approves or denies the result of a tool call that is waiting for review. */
  onConfirmResult(approved: boolean): void;
};

/** Reads the label of a tool call status. */
function stateLabel(toolCall: AHPToolCallState): string {
  if (toolCall.status === AHPToolCallStatus.Completed && !toolCall.success) {
    return "Failed";
  }

  if (toolCall.status === AHPToolCallStatus.Cancelled) {
    return toolCall.reason === AHPToolCallCancellationReason.Denied ? "Denied" : "Cancelled";
  }

  return STATE_LABELS[toolCall.status];
}

/** Reads the message that describes what the tool call did or will do. */
function detailText(toolCall: AHPToolCallState): string | undefined {
  switch (toolCall.status) {
    case AHPToolCallStatus.Streaming: {
      return toolCall.invocationMessage === undefined
        ? undefined
        : plainText(toolCall.invocationMessage);
    }

    case AHPToolCallStatus.PendingConfirmation:
    case AHPToolCallStatus.Running:
    case AHPToolCallStatus.AuthRequired: {
      return plainText(toolCall.invocationMessage);
    }

    case AHPToolCallStatus.PendingResultConfirmation: {
      return plainText(toolCall.pastTenseMessage);
    }

    case AHPToolCallStatus.Completed: {
      return toolCall.success
        ? plainText(toolCall.pastTenseMessage)
        : (toolCall.error?.message ?? plainText(toolCall.pastTenseMessage));
    }

    case AHPToolCallStatus.Cancelled: {
      return toolCall.reasonMessage === undefined ? undefined : plainText(toolCall.reasonMessage);
    }
  }
}

/** Reads the tool parameters as display text, when the call has received them. */
function parameterText(toolCall: AHPToolCallState): string | undefined {
  if (toolCall.status === AHPToolCallStatus.Streaming) {
    const { _meta: metadata } = toolCall;
    const snapshot = z.string().safeParse(metadata?.["acp.partialInput"]);

    return snapshot.success ? snapshot.data : toolCall.partialInput;
  }

  return "toolInput" in toolCall ? toolInputText(toolCall.toolInput) : undefined;
}

/** Reads the partial output of a tool call that is still executing. */
function progressText(toolCall: AHPToolCallState): string | undefined {
  return "content" in toolCall ? contentText(toolCall.content) : undefined;
}

type ConfirmationButtonsParams = {
  onDecide(approved: boolean): void;
};

/** Renders the approve and deny buttons of a confirmation prompt. */
function ConfirmationButtons({ onDecide }: ConfirmationButtonsParams): ReactElement {
  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
        onClick={(): void => {
          onDecide(true);
        }}
      >
        Approve
      </button>
      <button
        type="button"
        className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100"
        onClick={(): void => {
          onDecide(false);
        }}
      >
        Deny
      </button>
    </div>
  );
}

/**
 * Renders one AHP tool call.
 *
 * The card follows the protocol lifecycle directly, so each tool call status
 * maps to its own label and action. A call that waits for result confirmation
 * offers the same approve and deny choice as a call that waits for execution
 * confirmation.
 */
export function ToolCallView({
  toolCall,
  onConfirm,
  onConfirmResult,
}: ToolCallViewProps): ReactElement {
  const failed =
    (toolCall.status === AHPToolCallStatus.Completed && !toolCall.success) ||
    toolCall.status === AHPToolCallStatus.Cancelled;

  const detail = detailText(toolCall);
  const input = parameterText(toolCall);
  const progress = progressText(toolCall);

  const auth =
    toolCall.status === AHPToolCallStatus.AuthRequired ? toolCall.auth.description : undefined;

  return (
    <div className="min-w-0 rounded-md border border-neutral-300 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium wrap-anywhere">{toolCall.displayName}</span>
        <span className={failed ? "text-red-600" : "text-neutral-500"}>{stateLabel(toolCall)}</span>
      </div>
      {detail === undefined ? null : (
        <p
          className={
            failed ? "mt-1 text-red-600 wrap-anywhere" : "mt-1 text-neutral-600 wrap-anywhere"
          }
        >
          {detail}
        </p>
      )}
      {auth === undefined ? null : <p className="mt-1 text-neutral-600 wrap-anywhere">{auth}</p>}
      {input === undefined ? null : (
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-100 p-2 text-xs text-neutral-600">
          {input}
        </pre>
      )}
      {progress === undefined ? null : (
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-100 p-2 text-xs text-neutral-600">
          {progress}
        </pre>
      )}
      {toolCall.status === AHPToolCallStatus.PendingConfirmation ? (
        <ConfirmationButtons onDecide={onConfirm} />
      ) : null}
      {toolCall.status === AHPToolCallStatus.PendingResultConfirmation ? (
        <ConfirmationButtons onDecide={onConfirmResult} />
      ) : null}
    </div>
  );
}
