import * as z from "zod";
import {
  AvailableCommandsUpdateSchema,
  ConfigOptionUpdateSchema,
  CurrentModeUpdateSchema,
  SessionInfoUpdateSchema,
  UsageUpdateSchema,
  PlanSchema,
  PlanUpdateContentSchema,
  CompactionUpdateSchema,
  SubagentUpdateSchema,
  SessionMessageSchema,
  NoticeSchema,
  SessionNotificationSchema,
  type SessionNotification,
} from "./generated";
import type { SessionState } from "../ahp/channels/session/state";
import type { SessionAction } from "../ahp/channels/session/actions";

export const AcpSessionStateSchema = z.strictObject({
  commands: AvailableCommandsUpdateSchema.optional(),
  config: ConfigOptionUpdateSchema.optional(),
  mode: CurrentModeUpdateSchema.optional(),
  info: SessionInfoUpdateSchema.optional(),
  usage: UsageUpdateSchema.optional(),
  plan: PlanSchema.optional(),
  plans: z.record(z.string(), PlanUpdateContentSchema).optional(),
  compactions: z.record(z.string(), CompactionUpdateSchema).optional(),
  subagents: z.record(z.string(), SubagentUpdateSchema).optional(),
  messages: z.record(z.string(), SessionMessageSchema).optional(),
  notice: NoticeSchema.optional(),
  lastUpdate: SessionNotificationSchema.optional(),
});

export const AcpStateSchema = z.record(z.string(), AcpSessionStateSchema);

export type AcpSessionState = z.output<typeof AcpSessionStateSchema>;

export type AcpState = z.output<typeof AcpStateSchema>;

function applyAcpUpdate(state: AcpSessionState, { update }: SessionNotification): AcpSessionState {
  switch (update.sessionUpdate) {
    case "available_commands_update": {
      return { ...state, commands: update };
    }

    case "config_option_update": {
      return { ...state, config: update };
    }

    case "current_mode_update": {
      return { ...state, mode: update };
    }

    case "session_info_update": {
      return { ...state, info: { ...state.info, ...update } };
    }

    case "usage_update": {
      return { ...state, usage: update };
    }

    case "plan": {
      return { ...state, plan: update };
    }

    case "plan_update": {
      return { ...state, plans: { ...state.plans, [update.plan.planId]: update.plan } };
    }

    case "plan_removed": {
      const plans = { ...state.plans };
      delete plans[update.planId];

      return { ...state, plans };
    }

    case "compaction_update": {
      const previous = state.compactions?.[update.compactionId];

      return {
        ...state,
        compactions: { ...state.compactions, [update.compactionId]: { ...previous, ...update } },
      };
    }

    case "compaction_summary_chunk": {
      const previous = state.compactions?.[update.compactionId];

      if (!previous) {
        return state;
      }

      return {
        ...state,
        compactions: {
          ...state.compactions,
          [update.compactionId]: {
            ...previous,
            summary: [...(previous.summary ?? []), update.content],
          },
        },
      };
    }

    case "subagent_update": {
      const previous = state.subagents?.[update.sessionId];

      return {
        ...state,
        subagents: { ...state.subagents, [update.sessionId]: { ...previous, ...update } },
      };
    }

    case "session_message": {
      const previous = state.messages?.[update.messageId];

      return {
        ...state,
        messages: {
          ...state.messages,
          [update.messageId]: {
            ...previous,
            ...update,
            senderSessionId: update.senderSessionId ?? previous?.senderSessionId,
            recipientSessionId: update.recipientSessionId ?? previous?.recipientSessionId,
          },
        },
      };
    }

    case "session_message_chunk": {
      const previous = state.messages?.[update.messageId];

      return {
        ...state,
        messages: {
          ...state.messages,
          [update.messageId]: {
            ...previous,
            ...update,
            senderSessionId: update.senderSessionId ?? previous?.senderSessionId,
            recipientSessionId: update.recipientSessionId ?? previous?.recipientSessionId,
            content: [...(previous?.content ?? []), update.content],
          },
        },
      };
    }

    case "notice": {
      return { ...state, notice: update };
    }

    case "user_message_chunk":
    case "agent_message_chunk":
    case "agent_thought_chunk":
    case "tool_call":
    case "tool_call_update": {
      return state;
    }

    default: {
      const exhaustive: never = update;

      return exhaustive;
    }
  }
}

export function acpUpdateToSessionActions(
  session: Pick<SessionState, "_meta">,
  notification: SessionNotification,
  rootSessionId: string,
  hasTurn: boolean,
): SessionAction[] {
  const parsed = AcpStateSchema.safeParse(session["_meta"]?.acp);
  const state: AcpState = parsed.success ? parsed.data : {};
  const previous = state[notification.sessionId] ?? {};
  const applied = applyAcpUpdate(previous, notification);
  const next = hasTurn ? applied : { ...applied, lastUpdate: notification };
  const actions: SessionAction[] = [];

  if (next !== previous) {
    actions.push({
      type: "session/metaChanged",
      _meta: { ...session["_meta"], acp: { ...state, [notification.sessionId]: next } },
    });
  }

  const { update } = notification;

  if (
    notification.sessionId === rootSessionId &&
    update.sessionUpdate === "session_info_update" &&
    update.title !== void 0
  ) {
    actions.push({ type: "session/titleChanged", title: update.title ?? "" });
  }

  return actions;
}
