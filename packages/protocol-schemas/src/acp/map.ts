import type { ChatAction } from "../ahp/channels/chat/actions";
import type { ActiveTurn } from "../ahp/channels/chat/state";
import type { SessionNotification } from "./session";
import type { Message } from "../ahp/channels/chat/message";
import type { PromptRequest, StopReason } from "./prompt";
import { contentReference, toolContent } from "./content";
import { sessionUpdateText } from "./update-text";

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

function ahpMessageToAcpPrompt(message: Pick<Message, "text" | "attachments">): AcpPromptMapping {
  if ((message.attachments?.length ?? NO_ATTACHMENTS) > NO_ATTACHMENTS) {
    return { ok: false, reason: "unsupported-content" };
  }

  return { ok: true, blocks: [{ type: "text", text: message.text }] };
}

/** Wire-visible ids retain the turn/kind/index format across mapping changes. */
type ChatResponsePartIdParts = {
  turnId: string;
  kind: Extract<ActiveTurn["responseParts"][number], { id: string }>["kind"];
  index: number;
};

function chatResponsePartId({ turnId, kind, index }: ChatResponsePartIdParts): string {
  return `${turnId}/${kind}/${index}`;
}

type MappingState = {
  partCount: number;
  lastPart?: Pick<Extract<ActiveTurn["responseParts"][number], { id: string }>, "kind" | "id">;
  toolExists: boolean;
};

function acpUpdateToChatActions(
  turn: Pick<ActiveTurn, "id" | "responseParts"> | undefined,
  notification: SessionNotification,
  rootSessionId = notification.sessionId,
  mapping?: MappingState,
): ChatAction[] {
  if (!turn) {
    return [];
  }

  const { update } = notification;

  if (notification.sessionId !== rootSessionId) {
    return [
      systemUpdate(
        turn.id,
        notification,
        `${notification.sessionId}: ${sessionUpdateText(update)}`,
      ),
    ];
  }

  switch (update.sessionUpdate) {
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      if (update.content.type !== "text") {
        return [
          {
            type: "chat/responsePart",
            turnId: turn.id,
            part: { kind: "contentRef", ...contentReference(update.content) },
            _meta: { acp: notification },
          },
        ];
      }

      const kind = update.sessionUpdate === "agent_message_chunk" ? "markdown" : "reasoning";

      const last = mapping ? mapping.lastPart : turn.responseParts.at(LAST_PART_INDEX);

      const messageSuffix = update.messageId
        ? `/message/${encodeURIComponent(update.messageId)}`
        : "";

      const existing =
        last?.kind === kind &&
        (messageSuffix ? last.id.endsWith(messageSuffix) : !last.id.includes("/message/"))
          ? last
          : null;

      const partId =
        existing?.id ??
        `${chatResponsePartId({
          turnId: turn.id,
          kind,
          index: mapping?.partCount ?? turn.responseParts.length,
        })}${messageSuffix}`;

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
          _meta: { acp: update },
          ...toolInputFields(update.rawInput),
        },
        ...toolProgress(turn.id, update),
      ];
    }

    case "tool_call_update": {
      const tool = mapping
        ? void 0
        : turn.responseParts.find(
            (part) => part.kind === "toolCall" && part.toolCall.toolCallId === update.toolCallId,
          );

      if (!(mapping ? mapping.toolExists : tool)) {
        return [systemUpdate(turn.id, notification, sessionUpdateText(update))];
      }

      return toolProgress(turn.id, update);
    }

    case "available_commands_update":
    case "current_mode_update":
    case "config_option_update":
    case "session_info_update": {
      return [];
    }

    case "usage_update": {
      return [{ type: "chat/usage", turnId: turn.id, usage: { _meta: { acp: notification } } }];
    }

    case "user_message_chunk":
    case "plan":
    case "plan_update":
    case "plan_removed":
    case "notice":
    case "compaction_update":
    case "compaction_summary_chunk":
    case "subagent_update":
    case "session_message":
    case "session_message_chunk": {
      return [systemUpdate(turn.id, notification, sessionUpdateText(update))];
    }

    default: {
      const exhaustive: never = update;

      return exhaustive;
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
  const content = update.content?.flatMap(toolContent);

  const progress: ChatAction[] =
    update.sessionUpdate === "tool_call_update"
      ? [
          {
            type: "chat/toolCallDelta",
            turnId,
            toolCallId: update.toolCallId,
            invocationMessage: update.title ?? void 0,
            _meta: { acp: update },
          },
        ]
      : [];

  if (update.status === "completed" || update.status === "failed") {
    const result = {
      success: update.status === "completed",
      pastTenseMessage: update.status === "completed" ? "Tool completed" : "Tool failed",
    };

    return [
      ...progress,
      {
        type: "chat/toolCallComplete",
        turnId,
        toolCallId: update.toolCallId,
        result: { ...result, content, structuredContent: { acp: update } },
        _meta: { acp: update },
      },
    ];
  }

  return content
    ? [
        ...progress,
        {
          type: "chat/toolCallContentChanged",
          turnId,
          toolCallId: update.toolCallId,
          content,
          _meta: { acp: update },
        },
      ]
    : progress;
}

function systemUpdate(turnId: string, notification: SessionNotification, text: string): ChatAction {
  return {
    type: "chat/responsePart",
    turnId,
    part: { kind: "systemNotification", content: text, _meta: { acp: notification } },
  };
}

export {
  acpUpdateToChatActions,
  chatResponsePartId,
  acpStopReasonToOutcome,
  ahpMessageToAcpPrompt,
  type AcpPromptMapping,
  type AcpTurnOutcome,
};
