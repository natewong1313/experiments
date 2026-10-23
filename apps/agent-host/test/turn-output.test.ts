import { expect, it } from "vitest";
import {
  ActionType as AHPActionType,
  ResponsePartKind as AHPResponsePartKind,
  ToolCallConfirmationReason as AHPToolCallConfirmationReason,
  MessageKind as AHPMessageKind,
  SessionStatus as AHPSessionStatus,
  ToolCallStatus as AHPToolCallStatus,
  chatReducer as ahpChatReducer,
} from "@microsoft/agent-host-protocol";
import type {
  ChatAction as AHPChatAction,
  ChatState as AHPChatState,
  ResponsePart as AHPResponsePart,
} from "@microsoft/agent-host-protocol";
import type { TurnUpdate } from "../src/session/agent-connection";
import { TurnOutput } from "../src/session/turn-output";

/** An output for a turn, and the actions that it applies. */
type RecordedOutput = { output: TurnOutput; actions: AHPChatAction[] };

/** Returns an output for a turn whose stored response parts are `parts`. */
function outputOf(parts: AHPResponsePart[] = []): RecordedOutput {
  const actions: AHPChatAction[] = [];

  const output = new TurnOutput("turn", parts, async (_turnId, action) => {
    actions.push(action);

    return true;
  });

  return { output, actions };
}

/** Returns the parts of a turn with `parts` after the AHP reducer applies `actions`. */
function partsAfter(parts: AHPResponsePart[], actions: AHPChatAction[]): AHPResponsePart[] {
  let state: AHPChatState = {
    resource: "chat",
    title: "Chat",
    status: AHPSessionStatus.Idle,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    turns: [],
    activeTurn: {
      id: "turn",
      startedAt: "2026-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: AHPMessageKind.User } },
      responseParts: parts,
      usage: undefined,
    },
  };

  for (const action of actions) {
    state = ahpChatReducer(state, action);
  }

  return state.activeTurn?.responseParts ?? [];
}

/**
 * Replays `updates` to a turn with `parts`, as a prompt run after a restart does, and returns
 * the parts after it.
 */
async function replayTo(
  parts: AHPResponsePart[],
  updates: TurnUpdate[],
): Promise<AHPResponsePart[]> {
  const { output, actions } = outputOf(parts);
  await output.write({ kind: "replay", updates });

  return partsAfter(parts, actions);
}

function markdown(content: string, id = "turn"): AHPResponsePart {
  return { kind: AHPResponsePartKind.Markdown, id, content };
}

function text(content: string): TurnUpdate {
  return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: content } };
}

function thought(content: string): TurnUpdate {
  return { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: content } };
}

function toolStart(toolCallId: string): TurnUpdate {
  return {
    sessionUpdate: "tool_call",
    toolCallId,
    title: "read",
    name: "read",
    status: "in_progress",
    rawInput: { path: "/a" },
  };
}

function toolEnd(toolCallId: string, output: string): TurnUpdate {
  return {
    sessionUpdate: "tool_call_update",
    toolCallId,
    status: "completed",
    content: [{ type: "content", content: { type: "text", text: output } }],
  };
}

it("appends the text that a snapshot adds to the stored part, then the updates", async () => {
  const { output, actions } = outputOf([markdown("Hello")]);
  await output.write({ kind: "replay", updates: [text("Hello"), text(" world")] });
  await output.write({ kind: "live", update: text("!") });

  expect(actions).toEqual([
    { type: "chat/delta", turnId: "turn", partId: "turn", content: " world" },
    { type: "chat/delta", turnId: "turn", partId: "turn", content: "!" },
  ]);
});

it("writes nothing for a snapshot that equals the stored parts", async () => {
  const { output, actions } = outputOf([markdown("Hello")]);
  await output.write({ kind: "replay", updates: [text("Hello")] });

  expect(actions).toEqual([]);
});

it("writes a snapshot that is shorter than the stored part to a new part", async () => {
  const { output, actions } = outputOf([markdown("Hello world")]);
  await output.write({ kind: "replay", updates: [text("Hello")] });
  await output.write({ kind: "live", update: text(" there") });

  const [part, delta] = actions;
  expect(part).toMatchObject({
    type: "chat/responsePart",
    turnId: "turn",
    part: { kind: "markdown", content: "Hello" },
  });

  const partId =
    part?.type === AHPActionType.ChatResponsePart && "id" in part.part ? part.part.id : "";

  expect(partId).not.toBe("turn");
  expect(delta).toEqual({ type: "chat/delta", turnId: "turn", partId, content: " there" });
});

it("writes thinking, text, and a tool call to parts in order", async () => {
  const { output, actions } = outputOf();

  for (const update of [thought("Plan"), thought(" more"), text("Reading"), toolStart("call")]) {
    // oxlint-disable-next-line no-await-in-loop -- the updates arrive in order
    await output.write({ kind: "live", update });
  }

  await output.write({ kind: "live", update: toolEnd("call", "file text") });
  await output.write({ kind: "live", update: text("Done") });

  expect(actions.map((action) => action.type)).toEqual([
    "chat/responsePart",
    "chat/reasoning",
    "chat/responsePart",
    "chat/toolCallStart",
    "chat/toolCallReady",
    "chat/toolCallComplete",
    "chat/responsePart",
  ]);
  expect(actions[0]).toMatchObject({ part: { kind: "reasoning", id: "turn", content: "Plan" } });
  expect(actions[4]).toMatchObject({
    toolCallId: "call",
    invocationMessage: "read",
    toolInput: JSON.stringify({ path: "/a" }),
    confirmed: "not-needed",
  });
  expect(actions[5]).toMatchObject({
    result: { success: true, content: [{ type: "text", text: "file text" }] },
  });
});

it("completes a stored running tool call from a snapshot, and adds the text after it", async () => {
  const running: AHPResponsePart = {
    kind: AHPResponsePartKind.ToolCall,
    toolCall: {
      status: AHPToolCallStatus.Running,
      toolCallId: "call",
      toolName: "read",
      displayName: "read",
      invocationMessage: "read",
      confirmed: AHPToolCallConfirmationReason.NotNeeded,
    },
  };

  const { output, actions } = outputOf([markdown("Reading"), running]);

  await output.write({
    kind: "replay",
    updates: [text("Reading"), toolStart("call"), toolEnd("call", "file text"), text("Done")],
  });

  expect(actions.map((action) => action.type)).toEqual([
    "chat/toolCallComplete",
    "chat/responsePart",
  ]);
  expect(actions[1]).toMatchObject({ part: { kind: "markdown", content: "Done" } });
});

it("ignores an update of a tool call that never started", async () => {
  const { output, actions } = outputOf();
  await output.write({ kind: "live", update: toolEnd("unknown", "text") });

  expect(actions).toEqual([]);
});

it("keeps the parts of a replay that differs from the stored text when it replays again", async () => {
  const once = await replayTo([markdown("old")], [text("new")]);
  const twice = await replayTo(once, [text("new")]);

  expect(once.map((part) => "content" in part && part.content)).toEqual(["old", "new"]);
  expect(twice).toEqual(once);
});

it("continues the replayed part with live text, and keeps it on the next replay", async () => {
  const replayed = await replayTo([markdown("Hello world")], [text("Hello")]);
  const { output, actions } = outputOf(replayed);
  await output.write({ kind: "replay", updates: [text("Hello")] });
  await output.write({ kind: "live", update: text(" there") });
  const continued = partsAfter(replayed, actions);

  const again = await replayTo(continued, [text("Hello there")]);

  expect(again.map((part) => "content" in part && part.content)).toEqual([
    "Hello world",
    "Hello there",
  ]);
});

it("adds the last replayed part again when stale parts follow it, then keeps it", async () => {
  const once = await replayTo([markdown("A"), markdown("old", "stale")], [text("A")]);
  const twice = await replayTo(once, [text("A")]);

  expect(once.map((part) => "content" in part && part.content)).toEqual(["A", "old", "A"]);
  expect(twice).toEqual(once);
});

it("replays live output of thinking, text, and tool calls without changes", async () => {
  const updates = [
    thought("Plan"),
    text("A"),
    toolStart("call"),
    toolEnd("call", "file"),
    text("B"),
  ];

  const { output, actions } = outputOf();

  for (const update of updates) {
    // oxlint-disable-next-line no-await-in-loop -- the updates arrive in order
    await output.write({ kind: "live", update });
  }

  const live = partsAfter([], actions);
  const replay = outputOf(live);
  await replay.output.write({ kind: "replay", updates });

  expect(replay.actions).toEqual([]);
});

it("ignores stored parts of kinds that the output does not write", async () => {
  const notification: AHPResponsePart = {
    kind: AHPResponsePartKind.SystemNotification,
    content: "Compacted",
  };

  const reasoning: AHPResponsePart = { kind: AHPResponsePartKind.Reasoning, id: "r", content: "R" };

  const { output, actions } = outputOf([markdown("A"), notification, reasoning]);
  await output.write({ kind: "replay", updates: [text("A"), thought("R")] });

  expect(actions).toEqual([]);
});
