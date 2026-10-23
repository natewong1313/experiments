import type { SessionUpdate, Usage } from "@agentclientprotocol/sdk";
import type { OpenCodeMessage, OpenCodeSessionEvent } from "agents/harness/opencode";
import { textUpdates, toolCallStart } from "./acp-events";
import { textChunks, textTail } from "./frame-limits";

export function toolEnd(toolCallId: string, output: string, error: boolean): SessionUpdate {
  return {
    sessionUpdate: "tool_call_update",
    toolCallId,
    status: error ? "failed" : "completed",
    content: [{ type: "content", content: { type: "text", text: textTail(output) } }],
  };
}

export function messageUpdates(message: OpenCodeMessage): SessionUpdate[] {
  if (message.type === "user") {
    return textChunks(message.text).map((text) => ({
      sessionUpdate: "user_message_chunk",
      content: { type: "text", text },
    }));
  }

  if (message.type !== "assistant") {
    return [];
  }

  return message.content.flatMap((part): SessionUpdate[] => {
    if (part.type === "text" || part.type === "reasoning") {
      return textUpdates(part.type === "text" ? "text" : "thinking", part.text);
    }

    if (part.state.status === "streaming") {
      return [];
    }

    const start = toolCallStart(part.id, part.name, part.state.input);
    if (part.state.status === "running") {
      return [start];
    }

    const output =
      part.state.status === "error"
        ? part.state.error.message
        : part.state.content.map((item) => (item.type === "text" ? item.text : "")).join("\n");

    return [start, toolEnd(part.id, output, part.state.status === "error")];
  });
}

export function operationMessages(
  messages: readonly OpenCodeMessage[],
  id: string,
): OpenCodeMessage[] {
  const start = messages.findIndex(
    (message) => message.type === "user" && message.id === `msg_${id}`,
  );

  if (start === -1) {
    return [];
  }

  const later = messages.slice(start + 1);
  const end = later.findIndex((message) => message.type === "user");

  return end === -1 ? later : later.slice(0, end);
}

export function operationUsage(messages: readonly OpenCodeMessage[]): Usage | undefined {
  const answers = messages.filter((message) => message.type === "assistant");
  if (!answers.length) {
    return undefined;
  }

  return {
    totalTokens: answers.reduce(
      (sum, message) => sum + (message.tokens?.input ?? 0) + (message.tokens?.output ?? 0),
      0,
    ),
    inputTokens: answers.reduce((sum, message) => sum + (message.tokens?.input ?? 0), 0),
    outputTokens: answers.reduce((sum, message) => sum + (message.tokens?.output ?? 0), 0),
    thoughtTokens: answers.reduce((sum, message) => sum + (message.tokens?.reasoning ?? 0), 0),
    cachedReadTokens: answers.reduce((sum, message) => sum + (message.tokens?.cache.read ?? 0), 0),
    cachedWriteTokens: answers.reduce(
      (sum, message) => sum + (message.tokens?.cache.write ?? 0),
      0,
    ),
  };
}

export class OpenCodeUpdates {
  private lengths: Map<string, number> = new Map();
  private snapshotParts: Set<string> = new Set();
  private tools: Set<string> = new Set();

  constructor(messages: readonly OpenCodeMessage[]) {
    for (const message of messages) {
      if (message.type !== "assistant") {
        continue;
      }

      let text = 0;
      let reasoning = 0;

      for (const part of message.content) {
        if (part.type === "tool" && part.state.status !== "streaming") {
          this.tools.add(part.id);
        }

        if (part.type === "text" || part.type === "reasoning") {
          const ordinal = part.type === "text" ? text++ : reasoning++;
          const key = `${message.id}/${part.type}/${ordinal}`;
          this.lengths.set(key, part.text.length);
          this.snapshotParts.add(key);
        }
      }
    }
  }

  update(event: OpenCodeSessionEvent): SessionUpdate[] {
    switch (event.type) {
      case "text_delta":
      case "reasoning_delta":
      case "text_end":
      case "reasoning_end": {
        const kind = event.type.startsWith("text") ? "text" : "reasoning";
        const key = `${event.messageId}/${kind}/${event.ordinal}`;
        // eslint-disable-next-line capitalized-comments -- The shortcut marker uses a lowercase prefix.
        // shortcut: snapshot parts wait for end events because deltas lack offsets, stream them when OpenCode provides offsets.
        if ("delta" in event && this.snapshotParts.has(key)) {
          return [];
        }

        const length = this.lengths.get(key) ?? 0;
        const text = "delta" in event ? event.delta : event.text.slice(length);
        this.lengths.set(key, length + text.length);

        return textUpdates(kind === "text" ? "text" : "thinking", text);
      }

      case "tool_start": {
        const start = toolCallStart(event.toolCallId, event.name, event.input);
        if (this.tools.has(event.toolCallId)) {
          return [{ ...start, sessionUpdate: "tool_call_update" }];
        }

        this.tools.add(event.toolCallId);

        return [start];
      }

      case "tool_end": {
        return [toolEnd(event.toolCallId, event.output, event.error)];
      }

      case "fault": {
        throw new Error(event.message);
      }

      default: {
        return [];
      }
    }
  }
}
