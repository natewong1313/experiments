import * as z from "zod";
import type {
  SessionConfigOption,
  SessionUpdate,
  ToolCall,
  ToolKind,
} from "@agentclientprotocol/sdk";
import { copyJson, type JsonValue } from "@earendil-works/chord";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentEvent, EntryRecord, SnapshotEvent } from "@earendil-works/pi-durable";
import { boundedRaw, textChunks, textTail } from "./frame-limits";
import type { SessionModel } from "./model-option";

/** Returns the config options of a session with `model`. */
type ConfigOptionsOf = (model: SessionModel | undefined) => SessionConfigOption[];

// Map Pi tool names to the ACP tool kinds.
const toolKinds: Map<string, ToolKind> = new Map([
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

const PartialArgumentsSchema = z.object({ partialArguments: z.string().min(1).optional() });

type ToolBlock = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

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
export function toolCallStart(
  toolCallId: string,
  toolName: string,
  args: unknown,
): Extract<SessionUpdate, { sessionUpdate: "tool_call" }> {
  return {
    sessionUpdate: "tool_call",
    ...startFields(toolCallId, toolName, args, "in_progress"),
  };
}

/**
 * Returns the update that creates a tool call while the model still generates its parameters.
 * `partialInput` holds the generated parameter text or parsed arguments.
 */
export function toolCallPending(
  toolCallId: string,
  toolName: string,
  partialInput?: unknown,
): Extract<SessionUpdate, { sessionUpdate: "tool_call" }> {
  return {
    sessionUpdate: "tool_call",
    ...startFields(toolCallId, toolName, partialInput, "pending"),
  };
}

/** Returns the update that carries the current parameters of a pending tool call. */
export function toolCallPendingUpdate(
  toolCallId: string,
  partialInput: unknown,
): Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }> {
  return {
    sessionUpdate: "tool_call_update",
    toolCallId,
    status: "pending",
    rawInput: boundedRaw(partialInput),
  };
}

/** Returns the update that marks a tool call that the client already has as started again. */
function toolCallRestart(toolCallId: string, toolName: string, args: unknown): SessionUpdate {
  return {
    sessionUpdate: "tool_call_update",
    ...startFields(toolCallId, toolName, args, "in_progress"),
  };
}

function startFields(
  toolCallId: string,
  toolName: string,
  args: unknown,
  status: "pending" | "in_progress",
): ToolCall {
  return {
    toolCallId,
    title: toolName,
    name: toolName,
    kind: toolKinds.get(toolName) ?? "other",
    status,
    rawInput: boundedRaw(args),
  };
}

/**
 * Returns the parameter text that the model has generated for a tool call block so far.
 * Pi holds it outside the assistant message type, so read it defensively.
 */
export function partialArgumentsOf(block: ToolBlock): string | undefined {
  return PartialArgumentsSchema.safeParse(block).data?.partialArguments;
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
export function toolCallEnd(toolCallId: string, entry?: EntryRecord): SessionUpdate {
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
  private readonly sentTextLengths: Map<number, number> = new Map();
  private readonly toolBlocks: Map<number, { block: ToolBlock; input: JsonValue }> = new Map();
  private readonly currentToolOutputs: Map<string, string> = new Map();
  // The tool calls that the client already has. A later start of one only updates it.
  private readonly startedTools: Set<string> = new Set();
  // The tool calls that the client has while the model still generates their parameters.
  private readonly pendingTools: Set<string> = new Set();
  // The parameter text that the client has for each pending tool call.
  private readonly pendingInputs: Map<string, string> = new Map();
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

      if (part.type === "toolCall" && part.name !== "") {
        this.toolBlocks.set(index, { block: part, input: copyJson(part.arguments) });
        this.pendingTools.add(part.id);
        const input = partialArgumentsOf(part) ?? part.arguments;
        this.pendingInputs.set(part.id, JSON.stringify(input));
      }
    }

    const committedMessages = (snapshot?.entries ?? []).flatMap((entry) => entry.model ?? []);

    const committedBlocks = committedMessages.flatMap((message) =>
      message.role === "assistant" ? message.content : [],
    );

    for (const tool of snapshot?.tools ?? []) {
      if (
        tool.status === "pending" &&
        committedBlocks.some(
          (block) => block.type === "toolCall" && block.id === tool.callId && block.name !== "",
        )
      ) {
        this.pendingTools.add(tool.callId);
      }

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
      case "agent_changed": {
        return this.onAgentChanged(event);
      }

      case "message_start": {
        return this.onMessageStart(event);
      }

      case "message_end": {
        return this.onMessageEnd(event);
      }

      case "message_update": {
        return this.onMessageUpdate(event);
      }

      case "tool_execution_start": {
        return this.onToolExecutionStart(event);
      }

      case "tool_execution_update": {
        return this.onToolExecutionUpdate(event);
      }

      case "tool_execution_end": {
        return this.onToolExecutionEnd(event);
      }

      case "auto_retry_start":
      case "run_end": {
        return this.failPendingTools();
      }

      default: {
        return [];
      }
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

  private onMessageStart(event: Extract<AgentEvent, { type: "message_start" }>): SessionUpdate[] {
    if (event.message.role !== "assistant") {
      return [];
    }

    this.sentTextLengths.clear();

    // A new message ends the earlier attempt. Its unstarted tool calls have no result and must stop appearing as pending.
    return [...this.failPendingTools(), ...this.onMessage(event.message)];
  }

  private onMessage(message: AssistantMessage): SessionUpdate[] {
    this.toolBlocks.clear();

    return message.content.flatMap((block, index) => this.onBlock(block, index));
  }

  private onBlock(block: AssistantMessage["content"][number], index: number): SessionUpdate[] {
    if (block.type === "toolCall") {
      this.sentTextLengths.delete(index);
      const input = copyJson(block.arguments);
      this.toolBlocks.set(index, { block, input });

      return this.onToolCallBlock(block, partialArgumentsOf(block) ?? input);
    }

    this.toolBlocks.delete(index);

    return this.convertTextUpdate(
      block.type,
      block.type === "text" ? block.text : block.thinking,
      index,
    );
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
      if (change.type === "message") {
        return this.onMessage(change.message);
      }

      if ("block" in change) {
        return this.onBlock(change.block, change.contentIndex);
      }

      if (change.type === "toolcall_delta") {
        const tool = this.toolBlocks.get(change.contentIndex);

        if (!tool) {
          return [];
        }

        tool.input = appendArgument(tool.input, change.path, change.delta);

        return this.onToolCallBlock(tool.block, tool.input);
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

    const pending = this.pendingTools.delete(toolCallId);
    this.pendingInputs.delete(toolCallId);

    // ACP creates each tool call once. A generated call or a call resumed after restart already exists on the client.
    if (pending || this.startedTools.has(toolCallId)) {
      this.startedTools.add(toolCallId);

      return [toolCallRestart(toolCallId, toolName, args)];
    }

    this.startedTools.add(toolCallId);

    return [toolCallStart(toolCallId, toolName, args)];
  }

  /**
   * Creates a pending tool call or sends its current parameter snapshot.
   */
  private onToolCallBlock(block: ToolBlock, input: JsonValue): SessionUpdate[] {
    // A call that runs already has its final parameters.
    if (this.startedTools.has(block.id) || block.name === "") {
      return [];
    }

    const serialized = JSON.stringify(input);

    if (!this.pendingTools.has(block.id)) {
      this.pendingTools.add(block.id);

      this.pendingInputs.set(block.id, serialized);

      return [toolCallPending(block.id, block.name, input)];
    }

    if (serialized === this.pendingInputs.get(block.id)) {
      return [];
    }

    this.pendingInputs.set(block.id, serialized);

    return [toolCallPendingUpdate(block.id, input)];
  }

  /** Ends every pending tool call as failed, because the attempt that generated it ended. */
  private failPendingTools(): SessionUpdate[] {
    const updates = [...this.pendingTools].map((toolCallId) => toolCallEnd(toolCallId));

    this.pendingTools.clear();
    this.pendingInputs.clear();
    this.toolBlocks.clear();

    return updates;
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
    this.pendingTools.delete(event.toolCallId);
    this.pendingInputs.delete(event.toolCallId);

    return [toolCallEnd(event.toolCallId, event.entry)];
  }

  private convertTextUpdate(type: TextKind, text: string, index: number): SessionUpdate[] {
    const remaining = text.slice(this.sentTextLengths.get(index) ?? 0);
    this.sentTextLengths.set(index, text.length);

    return textUpdates(type, remaining);
  }
}

// JsonValue is validated by copyJson before path traversal.
/* oxlint-disable anti-slop/no-runtime-typeof */
function appendArgument(
  value: JsonValue,
  path: readonly (string | number)[],
  delta: string,
): JsonValue {
  const [key, ...rest] = path;

  if (key === undefined) {
    return typeof value === "string" ? value + delta : value;
  }

  if (Array.isArray(value)) {
    return typeof key === "number"
      ? value.map((item, index) => (index === key ? appendArgument(item, rest, delta) : item))
      : value;
  }

  if (value !== null && typeof value === "object" && Object.hasOwn(value, key)) {
    const child = value[key];

    if (child !== undefined) {
      return { ...value, [key]: appendArgument(child, rest, delta) };
    }
  }

  return value;
}

/* oxlint-enable anti-slop/no-runtime-typeof */
