import { expect, it } from "vitest";
import type { OpenCodeMessage } from "agents/harness/opencode";
import { OpenCodeUpdates } from "../src/opencode-events";
import { responseOf } from "../src/operations";

it("sends only the remaining text at the end of a streamed part", () => {
  const updates = new OpenCodeUpdates([]);

  const delta = updates.update({
    type: "text_delta",
    messageId: "answer",
    ordinal: 0,
    delta: "hello",
  });

  expect(delta).toEqual([
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hello" } },
  ]);
  expect(
    updates.update({ type: "text_end", messageId: "answer", ordinal: 0, text: "hello world" }),
  ).toEqual([{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: " world" } }]);
  expect(
    updates.update({ type: "text_end", messageId: "answer", ordinal: 0, text: "hello world" }),
  ).toEqual([]);
});

it("updates a restarted tool and reports failed tools", () => {
  const updates = new OpenCodeUpdates([]);

  const event = {
    type: "tool_start",
    messageId: "answer",
    toolCallId: "call",
    name: "write",
    input: {},
  } as const;

  expect(updates.update(event)[0]?.sessionUpdate).toBe("tool_call");
  expect(updates.update(event)[0]?.sessionUpdate).toBe("tool_call_update");
  expect(
    updates.update({
      type: "tool_end",
      messageId: "answer",
      toolCallId: "call",
      name: "write",
      output: "denied",
      error: true,
    })[0],
  ).toMatchObject({ status: "failed" });
});

it("reports OpenCode interruption as ACP cancellation", () => {
  expect(
    responseOf({
      operationId: "operation",
      session: "session",
      status: "unanswered",
      reason: "interrupted",
    }),
  ).toEqual({ stopReason: "cancelled" });
});

it("does not repeat buffered snapshot text or reasoning during replay", () => {
  const message: OpenCodeMessage = {
    type: "assistant",
    id: "answer",
    agent: "build",
    model: { providerID: "test", id: "test" },
    content: [
      { type: "text", text: "hello" },
      { type: "reasoning", text: "plan" },
    ],
    time: { created: 0 },
  };

  const updates = new OpenCodeUpdates([message]);
  expect(
    updates.update({ type: "text_delta", messageId: "answer", ordinal: 0, delta: "hello" }),
  ).toEqual([]);
  expect(
    updates.update({ type: "reasoning_delta", messageId: "answer", ordinal: 0, delta: "plan" }),
  ).toEqual([]);
  expect(
    updates.update({ type: "text_delta", messageId: "answer", ordinal: 0, delta: " world" }),
  ).toEqual([]);
  expect(
    updates.update({ type: "text_end", messageId: "answer", ordinal: 0, text: "hello world" }),
  ).toEqual([{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: " world" } }]);
  expect(
    updates.update({ type: "reasoning_end", messageId: "answer", ordinal: 0, text: "plan ahead" }),
  ).toEqual([{ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: " ahead" } }]);
});
