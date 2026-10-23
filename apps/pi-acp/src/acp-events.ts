import type {
  SessionConfigOption,
  SessionUpdate,
  ToolCall,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentEvent, EntryRecord, SnapshotEvent } from "@earendil-works/pi-durable";
import { boundedRaw, textChunks, textTail } from "./frame-limits";
import type { SessionModel } from "./model-option";

/** Returns the config options of a session with `model`. */
type ConfigOptionsOf = (model: SessionModel | undefined) => SessionConfigOption[];

// Map Pi tool names to the ACP tool kinds.
const toolKinds = new Map<string, ToolKind>([
  ["read", "read"],
  ["write", "edit"],
  ["edit", "edit"],
  ["delete", "delete"],
  // Stuff we actually map
  ["ls", "search"],
  ["find", "search"],
  ["grep", "search"],
  ["exec", "execute"],
]);

type TextKind = "text" | "thinking";

/** Returns the updates that carry `text` of an assistant block, each small enough for a frame. */
export function textUpdates(kind: TextKind, text: string): SessionUpdate[] {
  if (text === "") {
    return [];
  }

  return textChunks(text).map((chunk) => ({
    sessionUpdate: kind === "text" ? "agent_message_chunk" : "agent_thought_chunk",
    content: { type: "text", text: chunk },
  }));
}

/** Returns the text and thinking updates of an assistant message, in block order. */
export function messageTextUpdates(message: AssistantMessage): SessionUpdate[] {
  return message.content.flatMap((block) => {
    if (block.type === "text") {
      return textUpdates("text", block.text);
    }

    return block.type === "thinking" ? textUpdates("thinking", block.thinking) : [];
  });
}

/** Returns the update that creates a tool call that started. */
export function toolCallStart(toolCallId: string, toolName: string, args: unknown): SessionUpdate {
  return { sessionUpdate: "tool_call", ...startFields(toolCallId, toolName, args) };
}

/** Returns the update that marks a tool call that the client already has as started again. */
function toolCallRestart(toolCallId: string, toolName: string, args: unknown): SessionUpdate {
  return { sessionUpdate: "tool_call_update", ...startFields(toolCallId, toolName, args) };
}

function startFields(toolCallId: string, toolName: string, args: unknown): ToolCall {
  return {
    toolCallId,
    title: toolName,
    name: toolName,
    kind: toolKinds.get(toolName) ?? "other",
    status: "in_progress",
    rawInput: boundedRaw(args),
  };
}

/** Returns the update that carries the output of a running tool call so far. */
export function toolCallOutput(
  toolCallId: string,
  output: string,
  details?: unknown,
): SessionUpdate {
  return {
    sessionUpdate: "tool_call_update",
    toolCallId,
    status: "in_progress",
    content: [{ type: "content", content: { type: "text", text: textTail(output) } }],
    ...(details !== undefined && { rawOutput: boundedRaw({ details }) }),
  };
}

/**
 * Returns the update that ends a tool call with the tool result in `entry`. A call without a
 * result failed.
 */
export function toolCallEnd(toolCallId: string, entry: EntryRecord | undefined): SessionUpdate {
  const result = entry?.model?.[0];

  if (result?.role !== "toolResult") {
    return {
      sessionUpdate: "tool_call_update",
      toolCallId,
      status: "failed",
      rawOutput: null,
      content: [],
    };
  }

  const text = result.content.map((part) => (part.type === "text" ? part.text : "")).join("");

  return {
    sessionUpdate: "tool_call_update",
    toolCallId,
    status: result.isError ? "failed" : "completed",
    rawOutput: boundedRaw(result),
    content:
      text === "" ? [] : [{ type: "content", content: { type: "text", text: textTail(text) } }],
  };
}

// AcpEventUpdates
export class AcpEventUpdates {
  private readonly sentTextLengths = new Map<number, number>();
  private readonly currentToolOutputs = new Map<string, string>();
  // The tool calls that the client already has. A later start of one only updates it.
  private readonly startedTools = new Set<string>();
  private readonly configOptionsOf?: ConfigOptionsOf;
  private currentModel?: SessionModel;

  /**
   * Initializes text lengths and running tool output from `snapshot`. Snapshot text counts as already sent.
   * If `configOptionsOf` is provided, model changes produce config option updates.
   */
  constructor(snapshot?: SnapshotEvent, configOptionsOf?: ConfigOptionsOf) {
    this.configOptionsOf = configOptionsOf;
    this.currentModel = snapshot?.agent.model;

    for (const [index, part] of (snapshot?.generation?.message?.content ?? []).entries()) {
      if (part.type === "text" || part.type === "thinking") {
        this.sentTextLengths.set(index, (part.type === "text" ? part.text : part.thinking).length);
      }
    }

    for (const tool of snapshot?.tools ?? []) {
      if (tool.status !== "pending") {
        this.startedTools.add(tool.callId);
      }

      if (tool.status === "running" && tool.output !== undefined) {
        this.currentToolOutputs.set(tool.callId, tool.output);
      }
    }
  }

  update(event: AgentEvent): SessionUpdate[] {
    switch (event.type) {
      case "agent_changed":
        return this.onAgentChanged(event);
      case "message_start":
        return this.onMessageStart();
      case "message_end":
        return this.onMessageEnd(event);
      case "message_update":
        return this.onMessageUpdate(event);
      case "tool_execution_start":
        return this.onToolExecutionStart(event);
      case "tool_execution_update":
        return this.onToolExecutionUpdate(event);
      case "tool_execution_end":
        return this.onToolExecutionEnd(event);
      default:
        return [];
    }
  }

  private onAgentChanged(event: Extract<AgentEvent, { type: "agent_changed" }>): SessionUpdate[] {
    const { model } = event.agent;
    const changed =
      model?.provider !== this.currentModel?.provider ||
      model?.modelId !== this.currentModel?.modelId;
    this.currentModel = model;

    if (!changed || !this.configOptionsOf) {
      return [];
    }

    return [{ sessionUpdate: "config_option_update", configOptions: this.configOptionsOf(model) }];
  }

  private onMessageStart(): SessionUpdate[] {
    this.sentTextLengths.clear();
    return [];
  }

  private onMessageEnd(event: Extract<AgentEvent, { type: "message_end" }>): SessionUpdate[] {
    const message = event.entry.model?.[0];

    if (message?.role !== "assistant") {
      return [];
    }

    return message.content.flatMap((part, index): SessionUpdate[] => {
      if (part.type !== "text" && part.type !== "thinking") {
        return [];
      }

      const textContent = part.type === "text" ? part.text : part.thinking;
      return this.convertTextUpdate(part.type, textContent, index);
    });
  }

  private onMessageUpdate(event: Extract<AgentEvent, { type: "message_update" }>): SessionUpdate[] {
    return event.changes.flatMap((change): SessionUpdate[] => {
      if ("block" in change) {
        const { block, contentIndex } = change;

        if (block.type !== "text" && block.type !== "thinking") {
          this.sentTextLengths.delete(contentIndex);
          return [];
        }

        const textContent = block.type === "text" ? block.text : block.thinking;
        return this.convertTextUpdate(block.type, textContent, contentIndex);
      }

      if (change.type !== "text_delta" && change.type !== "thinking_delta") {
        return [];
      }

      this.sentTextLengths.set(
        change.contentIndex,
        (this.sentTextLengths.get(change.contentIndex) ?? 0) + change.delta.length,
      );

      return textUpdates(change.type === "text_delta" ? "text" : "thinking", change.delta);
    });
  }

  private onToolExecutionStart(
    event: Extract<AgentEvent, { type: "tool_execution_start" }>,
  ): SessionUpdate[] {
    const { toolCallId, toolName, args } = event;
    this.currentToolOutputs.delete(toolCallId);

    // ACP creates a tool call once. Pi starts a call again after a restart cut it off.
    if (this.startedTools.has(toolCallId)) {
      return [toolCallRestart(toolCallId, toolName, args)];
    }

    this.startedTools.add(toolCallId);

    return [toolCallStart(toolCallId, toolName, args)];
  }

  private onToolExecutionUpdate(
    event: Extract<AgentEvent, { type: "tool_execution_update" }>,
  ): SessionUpdate[] {
    let output = this.currentToolOutputs.get(event.toolCallId) ?? "";

    if (event.output !== undefined) {
      if ("set" in event.output) {
        output = event.output.set;
      } else {
        const retainedOutput = output.slice(event.output.trimStart ?? 0);
        const appendedOutput = event.output.append ?? "";
        output = retainedOutput + appendedOutput;
      }

      this.currentToolOutputs.set(event.toolCallId, output);
    }

    if (event.output === undefined && event.details === undefined) {
      return [];
    }

    return [toolCallOutput(event.toolCallId, output, event.details)];
  }

  private onToolExecutionEnd(
    event: Extract<AgentEvent, { type: "tool_execution_end" }>,
  ): SessionUpdate[] {
    this.currentToolOutputs.delete(event.toolCallId);
    return [toolCallEnd(event.toolCallId, event.entry)];
  }

  private convertTextUpdate(type: TextKind, text: string, index: number): SessionUpdate[] {
    const remaining = text.slice(this.sentTextLengths.get(index) ?? 0);
    this.sentTextLengths.set(index, text.length);

    return textUpdates(type, remaining);
  }
}
