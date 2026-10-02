import { expect, it } from "vitest";
import {
  acpStopReasonToOutcome,
  ahpMessageToAcpPrompt,
  acpUpdateToChatActions,
  type StopReason,
  type SessionNotification,
} from "../src/acp/index";

it("rejects attached content instead of silently sending only the message text", () => {
  expect(
    ahpMessageToAcpPrompt({
      text: "Describe this",
      attachments: [
        { type: "simple", label: "Context", modelRepresentation: "Details" },
      ],
    }),
  ).toEqual({ ok: false, reason: "unsupported-content" });
  expect(ahpMessageToAcpPrompt({ text: "Hello", attachments: [] })).toEqual({
    ok: true,
    blocks: [{ type: "text", text: "Hello" }],
  });
});

it("reuses adjacent markdown parts and creates a new wire id after reasoning", () => {
  const notification = {
    sessionId: "conversation",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "More" },
    },
  } satisfies SessionNotification;

  expect(
    acpUpdateToChatActions(
      {
        id: "turn",
        responseParts: [
          { kind: "markdown", id: "turn/markdown/0", content: "First" },
        ],
      },
      notification,
    ),
  ).toEqual([
    {
      type: "chat/delta",
      turnId: "turn",
      partId: "turn/markdown/0",
      content: "More",
    },
  ]);
  expect(
    acpUpdateToChatActions(
      {
        id: "turn",
        responseParts: [
          { kind: "markdown", id: "turn/markdown/0", content: "First" },
          { kind: "reasoning", id: "turn/reasoning/1", content: "Thinking" },
        ],
      },
      notification,
    ),
  ).toEqual([
    {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "turn/markdown/2", content: "" },
    },
    {
      type: "chat/delta",
      turnId: "turn",
      partId: "turn/markdown/2",
      content: "More",
    },
  ]);
});

it("omits unserializable tool input without losing the tool actions", () => {
  type CircularToolInput = { self?: CircularToolInput };

  const rawInput: CircularToolInput = {};
  rawInput.self = rawInput;

  const actions = acpUpdateToChatActions(
    { id: "turn", responseParts: [] },
    {
      sessionId: "conversation",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tool",
        title: "Read file",
        kind: "read",
        rawInput,
      },
    },
  );

  expect(actions).toEqual([
    {
      type: "chat/toolCallStart",
      turnId: "turn",
      toolCallId: "tool",
      toolName: "read",
      displayName: "Read file",
    },
    {
      type: "chat/toolCallReady",
      turnId: "turn",
      toolCallId: "tool",
      invocationMessage: "Read file",
      confirmed: "not-needed",
    },
  ]);
});

it.each(["max_tokens", "max_turn_requests", "refusal"] satisfies StopReason[])(
  "classifies %s as failure and retains the raw stop reason",
  (stopReason) => {
    expect(acpStopReasonToOutcome(stopReason)).toEqual({
      outcome: "failed",
      message: `The agent stopped before finishing: ${stopReason}`,
      stopReason,
    });
  },
);

it("distinguishes successful completion from cancellation", () => {
  expect(acpStopReasonToOutcome("end_turn").outcome).toBe("done");
  expect(acpStopReasonToOutcome("cancelled").outcome).toBe("cancelled");
});
