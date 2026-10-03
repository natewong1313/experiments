import type { SessionUpdate, ToolKind } from "@agentclientprotocol/sdk";
import type { AgentEvent } from "@earendil-works/pi-durable";

const toolKinds = new Map<string, ToolKind>([
  ["read", "read"],
  ["write", "edit"],
  ["edit", "edit"],
  ["delete", "delete"],
  ["ls", "search"],
  ["find", "search"],
  ["grep", "search"],
  ["exec", "execute"],
]);

function unsentTextUpdate({
  type,
  text,
  index,
  sentTextLengths,
}: {
  type: "text" | "thinking";
  text: string;
  index: number;
  sentTextLengths: Map<number, number>;
}): SessionUpdate[] {
  const remaining = text.slice(sentTextLengths.get(index) ?? 0);
  sentTextLengths.set(index, text.length);

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

export function eventUpdates(
  event: AgentEvent,
  sentTextLengths: Map<number, number>,
  currentToolOutputs: Map<string, string>,
): SessionUpdate[] {
  if (event.type === "message_start") {
    sentTextLengths.clear();
    return [];
  }

  if (event.type === "message_end") {
    const message = event.entry.model?.[0];

    if (message?.role !== "assistant") {
      return [];
    }

    return message.content.flatMap((part, index): SessionUpdate[] => {
      if (part.type !== "text" && part.type !== "thinking") {
        return [];
      }

      return unsentTextUpdate({
        type: part.type,
        text: part.type === "text" ? part.text : part.thinking,
        index,
        sentTextLengths,
      });
    });
  }

  if (event.type === "message_update") {
    return event.changes.flatMap((change): SessionUpdate[] => {
      if ("block" in change) {
        const { block, contentIndex } = change;

        if (block.type !== "text" && block.type !== "thinking") {
          sentTextLengths.delete(contentIndex);
          return [];
        }

        return unsentTextUpdate({
          type: block.type,
          text: block.type === "text" ? block.text : block.thinking,
          index: contentIndex,
          sentTextLengths,
        });
      }

      if (change.type !== "text_delta" && change.type !== "thinking_delta") {
        return [];
      }

      sentTextLengths.set(
        change.contentIndex,
        (sentTextLengths.get(change.contentIndex) ?? 0) + change.delta.length,
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

  if (event.type === "tool_execution_start") {
    currentToolOutputs.delete(event.toolCallId);
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

  if (event.type === "tool_execution_update") {
    const update: SessionUpdate = {
      sessionUpdate: "tool_call_update",
      toolCallId: event.toolCallId,
      status: "in_progress",
    };

    if (event.output !== undefined) {
      const output =
        "set" in event.output
          ? event.output.set
          : (currentToolOutputs.get(event.toolCallId) ?? "").slice(event.output.trimStart ?? 0) +
            (event.output.append ?? "");
      currentToolOutputs.set(event.toolCallId, output);
      update.content = [{ type: "content", content: { type: "text", text: output } }];
      update.rawOutput = { output, details: event.details };
    } else if (event.details !== undefined) {
      update.rawOutput = {
        output: currentToolOutputs.get(event.toolCallId) ?? "",
        details: event.details,
      };
    }

    return [update];
  }

  if (event.type === "tool_execution_end") {
    const message = event.entry?.model?.[0];
    const result = message?.role === "toolResult" ? message : undefined;
    currentToolOutputs.delete(event.toolCallId);

    return [
      {
        sessionUpdate: "tool_call_update",
        toolCallId: event.toolCallId,
        status: result && !result.isError ? "completed" : "failed",
        rawOutput: result ?? null,
        content:
          result?.content.flatMap((part) =>
            part.type === "text"
              ? [
                  {
                    type: "content",
                    content: { type: "text", text: part.text },
                  },
                ]
              : [],
          ) ?? [],
      },
    ];
  }

  return [];
}
