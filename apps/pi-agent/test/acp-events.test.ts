import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { AgentEvent } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";
import { eventUpdates } from "../src/acp-events";

function stream() {
  const lengths = new Map<number, number>();
  const toolOutputs = new Map<string, string>();

  return {
    lengths,
    toolOutputs,
    update: (event: AgentEvent) => eventUpdates(event, lengths, toolOutputs),
  };
}

const usage = fauxAssistantMessage([]).usage;

describe("ACP event conversion", () => {
  it.each([
    ["read", "read"],
    ["write", "edit"],
    ["edit", "edit"],
    ["delete", "delete"],
    ["ls", "search"],
    ["find", "search"],
    ["grep", "search"],
    ["exec", "execute"],
    ["custom", "other"],
  ])("reports %s tools as %s", (toolName, kind) => {
    expect(
      stream().update({
        type: "tool_execution_start",
        toolCallId: "tool-1",
        toolName,
        args: {},
      }),
    ).toMatchObject([{ sessionUpdate: "tool_call", kind }]);
  });

  it("reconstructs streamed tool output across appends, trims and replacements", () => {
    const { update, toolOutputs } = stream();
    const tool = { toolCallId: "tool-1", toolName: "exec" };

    for (const [output, text] of [
      [{ append: "first" }, "first"],
      [{ append: " second" }, "first second"],
      [{ trimStart: 6, append: " third" }, "second third"],
      [{ set: "replacement" }, "replacement"],
      [{ set: "" }, ""],
    ] satisfies [
      Extract<AgentEvent, { type: "tool_execution_update" }>["output"],
      string,
    ][]) {
      expect(
        update({ type: "tool_execution_update", ...tool, output }),
      ).toMatchObject([
        {
          status: "in_progress",
          content: [{ content: { type: "text", text } }],
          rawOutput: { output: text },
        },
      ]);
    }

    expect(
      update({
        type: "tool_execution_update",
        ...tool,
        details: { progress: 1 },
      }),
    ).toMatchObject([{ rawOutput: { output: "", details: { progress: 1 } } }]);
    expect(update({ type: "tool_execution_end", ...tool })).toMatchObject([
      { status: "failed", content: [], rawOutput: null },
    ]);
    expect(toolOutputs.has(tool.toolCallId)).toBe(false);
  });

  it("rebases replaced text blocks before subsequent deltas", () => {
    const { update, lengths } = stream();
    update({
      type: "message_update",
      usage,
      changes: [{ type: "text_delta", contentIndex: 0, delta: "original" }],
    });
    expect(
      update({
        type: "message_update",
        usage,
        changes: [
          {
            type: "block",
            contentIndex: 0,
            block: { type: "text", text: "new" },
          },
        ],
      }),
    ).toEqual([]);
    expect(lengths.get(0)).toBe(3);
    expect(
      update({
        type: "message_update",
        usage,
        changes: [{ type: "text_delta", contentIndex: 0, delta: " text" }],
      }),
    ).toMatchObject([{ content: { text: " text" } }]);
    expect(lengths.get(0)).toBe(8);
  });

  it("emits the new tail of whole thinking blocks once", () => {
    const { update, lengths } = stream();
    const event = {
      type: "message_update",
      usage,
      changes: [
        {
          type: "block",
          contentIndex: 0,
          block: { type: "thinking", thinking: "consider" },
        },
      ],
    } satisfies AgentEvent;
    expect(update(event)).toMatchObject([
      { sessionUpdate: "agent_thought_chunk", content: { text: "consider" } },
    ]);
    expect(update(event)).toEqual([]);
    expect(lengths.get(0)).toBe(8);
  });
});
