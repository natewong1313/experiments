import type { SessionUpdate } from "./generated";
import { contentText } from "./content";

function sessionUpdateText(update: SessionUpdate): string {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk":
    case "agent_thought_chunk":
    case "session_message_chunk":
    case "compaction_summary_chunk": {
      return contentText(update.content);
    }

    case "tool_call": {
      return update.title;
    }

    case "tool_call_update": {
      return update.title ?? `Tool ${update.toolCallId}: ${update.status ?? "updated"}`;
    }

    case "plan": {
      return update.entries.map((entry) => `[${entry.status}] ${entry.content}`).join("\n");
    }

    case "plan_update": {
      const { plan } = update;

      if (plan.type === "markdown") {
        return plan.content;
      }

      if (plan.type === "file") {
        return `Plan: ${plan.uri}`;
      }

      return plan.entries.map((entry) => `[${entry.status}] ${entry.content}`).join("\n");
    }

    case "plan_removed": {
      return `Plan removed: ${update.planId}`;
    }

    case "available_commands_update": {
      return update.availableCommands.map((command) => command.name).join(", ");
    }

    case "current_mode_update": {
      return `Mode: ${update.currentModeId}`;
    }

    case "config_option_update": {
      return "Session configuration updated";
    }

    case "session_info_update": {
      return update.title ?? "Session information updated";
    }

    case "usage_update": {
      return `Context: ${update.used}/${update.size}`;
    }

    case "notice": {
      return update.description ? `${update.title}\n${update.description}` : update.title;
    }

    case "compaction_update": {
      return `Context compaction ${update.status}${update.error ? `: ${update.error}` : ""}`;
    }

    case "subagent_update": {
      return `Subagent: ${update.title ?? update.sessionId}`;
    }

    case "session_message": {
      return update.content?.map(contentText).join("\n") ?? "Session message updated";
    }

    default: {
      const exhaustive: never = update;

      return exhaustive;
    }
  }
}

export { sessionUpdateText };
