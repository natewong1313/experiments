import { RequestError } from "@agentclientprotocol/sdk";
import type { SessionNotification } from "@experiments/protocol-schemas/acp";
import type { SessionGeneration } from "../sessions/record";
import { MemoryLimitError } from "../memory";

const MAX_SETUP_BYTES = 1_048_576;

const MAX_SUBAGENTS = 256;

type AgentUpdates = (
  identity: SessionGeneration,
  notification: SessionNotification,
  rootSessionId: string,
) => void;

class SessionUpdates {
  private readonly pending: SessionNotification[] = [];
  private readonly children: Map<string, string> = new Map();
  private pendingBytes = 0;
  private active = false;
  private sessionId: string | null;
  private readonly identity: SessionGeneration;
  private readonly publish: AgentUpdates;
  private readonly reloading: boolean;

  constructor(identity: SessionGeneration, sessionId: string | null, publish: AgentUpdates) {
    this.identity = identity;
    this.sessionId = sessionId;
    this.publish = publish;
    this.reloading = sessionId !== null;
  }

  receive(notification: SessionNotification): void {
    if (!this.active) {
      if (this.reloading && isHistory(notification)) {
        return;
      }

      this.pendingBytes += new TextEncoder().encode(JSON.stringify(notification)).byteLength;

      if (this.pendingBytes > MAX_SETUP_BYTES) {
        throw new MemoryLimitError("Agent setup updates exceed the memory budget");
      }

      this.pending.push(notification);

      return;
    }

    this.deliver(notification);
  }

  activate(sessionId: string): void {
    this.sessionId = sessionId;
    this.active = true;

    for (const notification of this.pending.splice(0)) {
      this.deliver(notification);
    }

    this.pendingBytes = 0;
  }

  private deliver(notification: SessionNotification): void {
    const root = this.sessionId;

    if (
      root === null ||
      (notification.sessionId !== root && !this.children.has(notification.sessionId))
    ) {
      return;
    }

    const { update } = notification;

    if (update.sessionUpdate === "subagent_update") {
      if (update.sessionId === root || update.sessionId === notification.sessionId) {
        throw RequestError.invalidParams("A subagent cannot own the root session");
      }

      if (!this.children.has(update.sessionId) && this.children.size >= MAX_SUBAGENTS) {
        throw new MemoryLimitError("Subagent capacity reached");
      }

      const owner = this.children.get(update.sessionId);

      if (owner !== void 0 && owner !== notification.sessionId) {
        throw RequestError.invalidParams("A subagent cannot change parents");
      }

      this.children.set(update.sessionId, notification.sessionId);
    }

    this.publish(this.identity, notification, root);
  }
}

function isHistory({ update }: SessionNotification): boolean {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk":
    case "agent_thought_chunk":
    case "tool_call":
    case "tool_call_update":
    case "session_message":
    case "session_message_chunk":
    case "compaction_summary_chunk": {
      return true;
    }

    case "plan":
    case "plan_update":
    case "plan_removed":
    case "available_commands_update":
    case "current_mode_update":
    case "config_option_update":
    case "session_info_update":
    case "usage_update":
    case "notice":
    case "compaction_update":
    case "subagent_update": {
      return false;
    }

    default: {
      const exhaustive: never = update;

      return exhaustive;
    }
  }
}

export { SessionUpdates, type AgentUpdates };
