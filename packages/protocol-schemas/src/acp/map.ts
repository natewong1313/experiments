import type { ChatAction } from "../ahp/channels/chat/actions";
import type { ActiveTurn } from "../ahp/channels/chat/state";
import type { ToolResultContent } from "../ahp/channels/chat/tool-call";
import type { SessionNotification } from "./session";
import type { Message } from "../ahp/channels/chat/message";
import type { PromptRequest, StopReason } from "./prompt";

const NO_ATTACHMENTS = 0;

const LAST_PART_INDEX = -1;

type AcpPromptMapping =
  | { ok: true; blocks: PromptRequest["prompt"] }
  | { ok: false; reason: "unsupported-content" };

type AcpTurnOutcome =
  | { outcome: "done"; message: string; stopReason: "end_turn" }
  | { outcome: "cancelled"; message: string; stopReason: "cancelled" }
  | {
      outcome: "failed";
      message: string;
      stopReason: Exclude<StopReason, "end_turn" | "cancelled">;
    };

function acpStopReasonToOutcome(stopReason: StopReason): AcpTurnOutcome {
  switch (stopReason) {
    case "end_turn": {
      return { outcome: "done", message: "", stopReason };
    }

    case "cancelled": {
      return {
        outcome: "cancelled",
        message: "The agent cancelled the turn",
        stopReason,
      };
    }

    default: {
      return {
        outcome: "failed",
        message: `The agent stopped before finishing: ${stopReason}`,
        stopReason,
      };
    }
  }
}

function ahpMessageToAcpPrompt(
  message: Pick<Message, "text" | "attachments">,
): AcpPromptMapping {
  if ((message.attachments?.length ?? NO_ATTACHMENTS) > NO_ATTACHMENTS) {
    return { ok: false, reason: "unsupported-content" };
  }

  return { ok: true, blocks: [{ type: "text", text: message.text }] };
}

/** Wire-visible ids retain the turn/kind/index format across mapping changes. */
function chatResponsePartId({
  turnId,
  kind,
  index,
}: {
  turnId: string;
  kind: Extract<ActiveTurn["responseParts"][number], { id: string }>["kind"];
  index: number;
}): string {
  return `${turnId}/${kind}/${index}`;
}

function acpUpdateToChatActions(
  turn: Pick<ActiveTurn, "id" | "responseParts"> | undefined,
  notification: SessionNotification,
): ChatAction[] {
  if (!turn) {
    return [];
  }

  const { update } = notification;

  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      if (update.content.type !== "text") {
        return [];
      }

      const kind =
        update.sessionUpdate === "agent_message_chunk"
          ? "markdown"
          : "reasoning";

      const last = turn.responseParts.at(LAST_PART_INDEX);
      const existing = last?.kind === kind ? last : null;

      const partId =
        existing?.id ??
        chatResponsePartId({
          turnId: turn.id,
          kind,
          index: turn.responseParts.length,
        });

      const actions: ChatAction[] = existing
        ? []
        : [
            {
              type: "chat/responsePart",
              turnId: turn.id,
              part: { kind, id: partId, content: "" },
            },
          ];

      actions.push({
        type: kind === "reasoning" ? "chat/reasoning" : "chat/delta",
        turnId: turn.id,
        partId,
        content: update.content.text,
      });

      return actions;
    }

    case "tool_call": {
      const { toolCallId, title } = update;

      return [
        {
          type: "chat/toolCallStart",
          turnId: turn.id,
          toolCallId,
          toolName: update.kind ?? "tool",
          displayName: title,
        },
        {
          type: "chat/toolCallReady",
          turnId: turn.id,
          toolCallId,
          invocationMessage: title,
          confirmed: "not-needed",
          ...toolInputFields(update.rawInput),
        },
        ...toolProgress(turn.id, update),
      ];
    }

    case "tool_call_update": {
      const tool = turn.responseParts.find(
        (part) =>
          part.kind === "toolCall" &&
          part.toolCall.toolCallId === update.toolCallId,
      );

      if (!tool) {
        return [];
      }

      return toolProgress(turn.id, update);
    }
  }
}

type ToolUpdate = Extract<
  SessionNotification["update"],
  { sessionUpdate: "tool_call" | "tool_call_update" }
>;

function toolInputFields<T>(
  value: T,
): Pick<Extract<ChatAction, { type: "chat/toolCallReady" }>, "toolInput"> {
  try {
    const toolInput = JSON.stringify(value);

    return toolInput ? { toolInput } : {};
  } catch {
    return {};
  }
}

function toolProgress(turnId: string, update: ToolUpdate): ChatAction[] {
  const content = update.content?.flatMap((item): ToolResultContent[] =>
    item.type === "content" && item.content.type === "text"
      ? [{ type: "text", text: item.content.text }]
      : [],
  );

  if (update.status === "completed" || update.status === "failed") {
    const result = {
      success: update.status === "completed",
      pastTenseMessage:
        update.status === "completed" ? "Tool completed" : "Tool failed",
    };

    return [
      {
        type: "chat/toolCallComplete",
        turnId,
        toolCallId: update.toolCallId,
        result: content ? { ...result, content } : result,
      },
    ];
  }

  return content
    ? [
        {
          type: "chat/toolCallContentChanged",
          turnId,
          toolCallId: update.toolCallId,
          content,
        },
      ]
    : [];
}

export {
  acpUpdateToChatActions,
  chatResponsePartId,
  acpStopReasonToOutcome,
  ahpMessageToAcpPrompt,
  type AcpPromptMapping,
  type AcpTurnOutcome,
};
