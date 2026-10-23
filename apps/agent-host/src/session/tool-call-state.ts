import {
  ActionType as AHPActionType,
  ToolCallConfirmationReason as AHPToolCallConfirmationReason,
  ToolCallStatus as AHPToolCallStatus,
  ToolResultContentType as AHPToolResultContentType,
} from "@microsoft/agent-host-protocol";
import type {
  ChatAction as AHPChatAction,
  ToolCallState as AHPToolCallState,
  ToolResultContent as AHPToolResultContent,
} from "@microsoft/agent-host-protocol";
import type {
  ToolCallContent as ACPToolCallContent,
  ToolCallStatus as ACPToolCallStatus,
} from "@agentclientprotocol/sdk";
import type { TurnUpdate } from "./agent-connection";

/** A tool call update of a prompt. */
export type ToolUpdate = Extract<TurnUpdate, { sessionUpdate: "tool_call" | "tool_call_update" }>;

/** A tool call as its ACP updates describe it so far. */
export type ToolCall = {
  toolCallId: string;
  name: string;
  title: string;
  status: ACPToolCallStatus;
  input?: unknown;
  /** The parameter text that the model streamed while the call is pending. */
  partialInput?: string;
  content?: AHPToolResultContent[];
};

/**
 * How far the AHP part of a tool call has advanced: `streaming` before it runs, `running` while
 * it runs, and `ended` once it completed or failed. `contentKey` identifies the content that a
 * running part shows. `partial` holds the parameter text that a streaming part shows.
 */
export type ToolProgress = {
  stage: "streaming" | "running" | "ended";
  contentKey?: string;
  partial?: string;
};

/** The progress of a tool call part after some actions, and those actions. */
export type ToolAdvance = { progress: ToolProgress; actions: AHPChatAction[] };

/**
 * Returns the tool call after `update`, or undefined for an update of a tool call that never
 * started, which has no name to show.
 */
export function mergeToolCall(
  previous: ToolCall | undefined,
  update: ToolUpdate,
): ToolCall | undefined {
  if (!previous && update.sessionUpdate === "tool_call_update" && (update.title ?? "") === "") {
    return;
  }

  const name = update.name ?? previous?.name ?? update.title ?? update.toolCallId;
  const content = update.content ? toolContentOf(update.content) : previous?.content;

  const reported = update.rawInput;
  const status = update.status ?? previous?.status ?? "pending";

  let partialInput = previous?.partialInput;

  if (isPartialInput(reported)) {
    partialInput = reported;
  } else if (reported !== undefined && status === "pending") {
    partialInput = JSON.stringify(reported);
  }

  const input = isPartialInput(reported) ? previous?.input : (reported ?? previous?.input);

  return {
    toolCallId: update.toolCallId,
    name,
    title: update.title ?? previous?.title ?? name,
    status,
    ...(input !== undefined && { input }),
    ...(partialInput !== undefined && { partialInput }),
    ...(content !== undefined && { content }),
  };
}

function isPartialInput(input: unknown): input is string {
  return typeof input === "string";
}

/** Returns the progress of a stored tool call part. */
export function progressOf(toolCall: AHPToolCallState): ToolProgress {
  if (toolCall.status === AHPToolCallStatus.Streaming) {
    const snapshot = toolCall._meta?.["acp.partialInput"];
    const partial = isPartialInput(snapshot) ? snapshot : toolCall.partialInput;

    return {
      stage: "streaming",
      ...(partial !== undefined && { partial }),
    };
  }

  if (toolCall.status !== AHPToolCallStatus.Running) {
    // The agent does not control a tool call that waits for a confirmation.
    // The output treats it as ended.
    return { stage: "ended" };
  }

  const contentKey = toolCall.content && JSON.stringify(toolCall.content);

  return contentKey === undefined ? { stage: "running" } : { stage: "running", contentKey };
}

/**
 * Returns the actions that advance a tool call part from `progress` to `call`, and the progress
 * after them. Without `progress`, the actions start the part. A call runs once its status leaves
 * `pending`, and ends once it completes or fails. An ended part does not change.
 */
export function advanceToolCall(
  turnId: string,
  progress: ToolProgress | undefined,
  call: ToolCall,
): ToolAdvance {
  const base = { turnId, toolCallId: call.toolCallId };
  const actions: AHPChatAction[] = [];
  let next: ToolProgress = progress ?? { stage: "streaming" };

  if (!progress) {
    actions.push({
      type: AHPActionType.ChatToolCallStart,
      ...base,
      toolName: call.name,
      displayName: call.title,
    });
  }

  if (next.stage === "streaming") {
    const partial = call.partialInput;

    if (partial !== undefined && partial !== next.partial) {
      const previous = next.partial ?? "";
      const added = partial.startsWith(previous) ? partial.slice(previous.length) : undefined;

      next = { stage: "streaming", partial };

      actions.push({
        type: AHPActionType.ChatToolCallDelta,
        ...base,
        ...(added !== undefined && added !== "" && { content: added }),
        _meta: { "acp.partialInput": partial },
      });
    }
  }

  if (next.stage === "streaming" && call.status !== "pending") {
    const toolInput = call.input === undefined ? call.partialInput : JSON.stringify(call.input);

    next = { stage: "running" };
    actions.push({
      type: AHPActionType.ChatToolCallReady,
      ...base,
      invocationMessage: call.title,
      ...(toolInput !== undefined && { toolInput }),
      confirmed: AHPToolCallConfirmationReason.NotNeeded,
    });
  }

  if (next.stage !== "running") {
    return { progress: next, actions };
  }

  if (call.status === "completed" || call.status === "failed") {
    const success = call.status === "completed";
    actions.push({
      type: AHPActionType.ChatToolCallComplete,
      ...base,
      result: {
        success,
        pastTenseMessage: call.title,
        ...(call.content && { content: call.content }),
        ...(!success && { error: { message: errorMessageOf(call) } }),
      },
    });

    return { progress: { stage: "ended" }, actions };
  }

  const contentKey = call.content && JSON.stringify(call.content);

  if (call.content && contentKey !== next.contentKey) {
    next = { stage: "running", contentKey };
    actions.push({
      type: AHPActionType.ChatToolCallContentChanged,
      ...base,
      content: call.content,
    });
  }

  return { progress: next, actions };
}

/** Returns the AHP content of ACP tool call content. Only text content has an AHP form here. */
function toolContentOf(content: readonly ACPToolCallContent[]): AHPToolResultContent[] {
  return content.flatMap((item): AHPToolResultContent[] =>
    item.type === "content" && item.content.type === "text"
      ? [{ type: AHPToolResultContentType.Text, text: item.content.text }]
      : [],
  );
}

function errorMessageOf(call: ToolCall): string {
  const text = (call.content ?? [])
    .map((item) => (item.type === AHPToolResultContentType.Text ? item.text : ""))
    .join("");

  return text === "" ? `${call.title} failed` : text;
}
