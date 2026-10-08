import type { SessionUpdate } from "../src/acp";

export const ACP_UPDATES = {
  user_message_chunk: {
    sessionUpdate: "user_message_chunk",
    content: { type: "text", text: "User echo" },
  },
  agent_message_chunk: {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "Answer" },
  },
  agent_thought_chunk: {
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "Reasoning" },
  },
  tool_call: {
    sessionUpdate: "tool_call",
    toolCallId: "tool",
    title: "Read",
    kind: "read",
    rawInput: { path: "/workspace/file.txt" },
  },
  tool_call_update: {
    sessionUpdate: "tool_call_update",
    toolCallId: "tool",
    status: "completed",
    rawOutput: { result: true },
    content: [
      { type: "content", content: { type: "image", data: "AQ==", mimeType: "image/png" } },
      { type: "diff", path: "/workspace/file.txt", oldText: "Before", newText: "After" },
      { type: "terminal", terminalId: "terminal" },
    ],
  },
  plan: {
    sessionUpdate: "plan",
    entries: [{ content: "Read", priority: "medium", status: "pending" }],
  },
  plan_update: {
    sessionUpdate: "plan_update",
    plan: { type: "markdown", planId: "plan", content: "# Plan" },
  },
  plan_removed: { sessionUpdate: "plan_removed", planId: "plan" },
  available_commands_update: {
    sessionUpdate: "available_commands_update",
    availableCommands: [{ name: "help", description: "Get help" }],
  },
  current_mode_update: { sessionUpdate: "current_mode_update", currentModeId: "code" },
  config_option_update: {
    sessionUpdate: "config_option_update",
    configOptions: [{ type: "boolean", id: "thinking", name: "Thinking", currentValue: true }],
  },
  session_info_update: {
    sessionUpdate: "session_info_update",
    title: "Agent title",
    updatedAt: "2026-10-03T00:00:00Z",
  },
  usage_update: {
    sessionUpdate: "usage_update",
    used: 20,
    size: 100,
    cost: { amount: 0.25, currency: "USD" },
  },
  notice: {
    sessionUpdate: "notice",
    severity: "warning",
    title: "Rate limit",
    description: "Try again later",
  },
  compaction_update: {
    sessionUpdate: "compaction_update",
    compactionId: "compaction",
    status: "in_progress",
  },
  compaction_summary_chunk: {
    sessionUpdate: "compaction_summary_chunk",
    compactionId: "compaction",
    content: { type: "text", text: "Summary" },
  },
  subagent_update: {
    sessionUpdate: "subagent_update",
    sessionId: "child",
    title: "Research",
    state: { state: "running" },
  },
  session_message: {
    sessionUpdate: "session_message",
    messageId: "message",
    senderSessionId: "conversation",
    recipientSessionId: "child",
    content: [{ type: "text", text: "Find details" }],
  },
  session_message_chunk: {
    sessionUpdate: "session_message_chunk",
    messageId: "message",
    content: { type: "text", text: "More details" },
  },
} satisfies Record<SessionUpdate["sessionUpdate"], SessionUpdate>;
