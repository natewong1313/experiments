import { expect, it } from "vitest";
import { ActionType as AHPActionType } from "@microsoft/agent-host-protocol";
import type { ChatAction as AHPChatAction } from "@microsoft/agent-host-protocol";
import { TurnOutput } from "../src/session/turn-output";

/** An output for a turn, and the actions that it applies. */
type RecordedOutput = { output: TurnOutput; actions: AHPChatAction[] };

/** Returns an output for a turn whose stored markdown part has `content`. */
function outputOf(content: string): RecordedOutput {
  const actions: AHPChatAction[] = [];

  const output = new TurnOutput("turn", { id: "turn", content }, async (_turnId, action) => {
    actions.push(action);

    return true;
  });

  return { output, actions };
}

it("appends the text that a snapshot adds to the stored part, then the deltas", async () => {
  const { output, actions } = outputOf("Hello");
  await output.write({ kind: "snapshot", text: "Hello world" });
  await output.write({ kind: "delta", text: "!" });

  expect(actions).toEqual([
    { type: "chat/delta", turnId: "turn", partId: "turn", content: " world" },
    { type: "chat/delta", turnId: "turn", partId: "turn", content: "!" },
  ]);
});

it("writes nothing for a snapshot that equals the stored part", async () => {
  const { output, actions } = outputOf("Hello");
  await output.write({ kind: "snapshot", text: "Hello" });

  expect(actions).toEqual([]);
});

it("writes a snapshot that is shorter than the stored part to a new part", async () => {
  const { output, actions } = outputOf("Hello world");
  await output.write({ kind: "snapshot", text: "Hello" });
  await output.write({ kind: "delta", text: " there" });

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
