import { expect, it } from "vitest";
import type { ChatAction, ChatState } from "@experiments/protocol-schemas/ahp";
import { reduceChat as referenceReducer } from "../src/state/reducers";
import { parseChat, reduceChat, wireState } from "../examples/web/src/lib/ahp/state";

const TOOL_COUNT = 500;

const INITIAL: ChatState = {
  resource: "ahp-chat:/client",
  title: "Chat",
  status: 1,
  modifiedAt: "2026-10-01T00:00:00.000Z",
  turns: [],
};

function appendAction(actions: ChatAction[], ...items: ChatAction[]): void {
  actions.push(...items);
}

it("keeps indexed browser state equal to the official reducer and preserves previous views", () => {
  const actions: ChatAction[] = [
    {
      type: "chat/turnStarted",
      turnId: "turn",
      startedAt: INITIAL.modifiedAt,
      message: { text: "hello", origin: { kind: "user" } },
    },
    {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "text", content: "" },
    },
  ];

  for (let index = 0; index < TOOL_COUNT; index++) {
    appendAction(
      actions,
      {
        type: "chat/toolCallStart",
        turnId: "turn",
        toolCallId: `tool-${index}`,
        toolName: "tool",
        displayName: "Tool",
      },
      {
        type: "chat/toolCallReady",
        turnId: "turn",
        toolCallId: `tool-${index}`,
        invocationMessage: "run",
        confirmed: "not-needed",
      },
    );
  }

  appendAction(
    actions,
    {
      type: "chat/toolCallContentChanged",
      turnId: "turn",
      toolCallId: "tool-0",
      content: [{ type: "text", text: "old" }],
    },
    {
      type: "chat/toolCallContentChanged",
      turnId: "turn",
      toolCallId: "tool-0",
      content: [{ type: "text", text: "replacement" }],
    },
  );
  appendAction(
    actions,
    { type: "chat/delta", turnId: "turn", partId: "text", content: "😀漢字" },
    { type: "chat/usage", turnId: "turn", usage: { _meta: { tokens: 10 } } },
  );
  appendAction(actions, { type: "chat/turnComplete", turnId: "turn", duration: 1 });
  let mirror = INITIAL;
  let state = parseChat(INITIAL);

  for (const action of actions) {
    const previous = state;
    const previousWire = wireState(previous);
    state = reduceChat(state, action);
    mirror = referenceReducer(mirror, action);
    expect(wireState(state)).toEqual(mirror);
    expect(wireState(previous)).toEqual(previousWire);
  }
});

it("validates new actions without reparsing accumulated text and preserves duplicate identity rules", () => {
  const actions: ChatAction[] = [
    {
      type: "chat/turnStarted",
      turnId: "turn",
      startedAt: INITIAL.modifiedAt,
      message: { text: "hello", origin: { kind: "user" } },
    },
    {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "reasoning", id: "same", content: "first" },
    },
    {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "reasoning", id: "same", content: "second" },
    },
    { type: "chat/reasoning", turnId: "turn", partId: "same", content: " updated" },
    { type: "chat/delta", turnId: "turn", partId: "same", content: "ignored" },
    {
      type: "chat/toolCallStart",
      turnId: "turn",
      toolCallId: "tool",
      toolName: "tool",
      displayName: "Tool",
    },
    {
      type: "chat/toolCallReady",
      turnId: "turn",
      toolCallId: "tool",
      invocationMessage: "confirm",
    },
    {
      type: "chat/toolCallStart",
      turnId: "turn",
      toolCallId: "other",
      toolName: "tool",
      displayName: "Other",
    },
    {
      type: "chat/toolCallReady",
      turnId: "turn",
      toolCallId: "other",
      invocationMessage: "confirm",
    },
    {
      type: "chat/toolCallConfirmed",
      turnId: "turn",
      toolCallId: "tool",
      approved: false,
      reason: "denied",
    },
    {
      type: "chat/toolCallComplete",
      turnId: "turn",
      toolCallId: "other",
      result: { success: true, pastTenseMessage: "done" },
    },
  ];

  let mirror = INITIAL;
  let state = parseChat(INITIAL);

  for (const action of actions) {
    state = reduceChat(state, action);
    mirror = referenceReducer(mirror, action);
    expect(wireState(state)).toEqual(mirror);
  }
});
