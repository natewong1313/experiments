import type { SessionUpdate, ToolKind } from "@agentclientprotocol/sdk";
import type { AgentEvent } from "@earendil-works/pi-durable";

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

// AcpEventUpdates
export class AcpEventUpdates {
  private readonly sentTextLengths = new Map<number, number>();
  private readonly currentToolOutputs = new Map<string, string>();

  update(event: AgentEvent): SessionUpdate[] {
    switch (event.type) {
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

      return [
        {
          sessionUpdate:
            change.type === "text_delta" ? "agent_message_chunk" : "agent_thought_chunk",
          content: { type: "text", text: change.delta },
        },
      ];
    });
  }

  private onToolExecutionStart(
    event: Extract<AgentEvent, { type: "tool_execution_start" }>,
  ): SessionUpdate[] {
    this.currentToolOutputs.delete(event.toolCallId);
    return [
      {
        sessionUpdate: "tool_call",
        toolCallId: event.toolCallId,
        title: event.toolName,
        kind: toolKinds.get(event.toolName) ?? "other",
        status: "in_progress",
        rawInput: event.args,
      },
    ];
  }

  private onToolExecutionUpdate(
    event: Extract<AgentEvent, { type: "tool_execution_update" }>,
  ): SessionUpdate[] {
    const update: SessionUpdate = {
      sessionUpdate: "tool_call_update",
      toolCallId: event.toolCallId,
      status: "in_progress",
    };

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
      update.content = [{ type: "content", content: { type: "text", text: output } }];
    }

    if (event.output !== undefined || event.details !== undefined) {
      update.rawOutput = { output, details: event.details };
    }

    return [update];
  }

  private onToolExecutionEnd(
    event: Extract<AgentEvent, { type: "tool_execution_end" }>,
  ): SessionUpdate[] {
    this.currentToolOutputs.delete(event.toolCallId);
    const result = event.entry?.model?.[0];

    if (result?.role !== "toolResult") {
      return [
        {
          sessionUpdate: "tool_call_update",
          toolCallId: event.toolCallId,
          status: "failed",
          rawOutput: null,
          content: [],
        },
      ];
    }

    return [
      {
        sessionUpdate: "tool_call_update",
        toolCallId: event.toolCallId,
        status: result.isError ? "failed" : "completed",
        rawOutput: result,
        content: result.content
          .filter((part) => part.type === "text")
          .map((part) => ({
            type: "content",
            content: { type: "text", text: part.text },
          })),
      },
    ];
  }

  private convertTextUpdate(
    type: "text" | "thinking",
    text: string,
    index: number,
  ): SessionUpdate[] {
    const remaining = text.slice(this.sentTextLengths.get(index) ?? 0);
    this.sentTextLengths.set(index, text.length);

    if (remaining === "") {
      return [];
    }

    return [
      {
        sessionUpdate: type === "text" ? "agent_message_chunk" : "agent_thought_chunk",
        content: { type: "text", text: remaining },
      },
    ];
  }
}
