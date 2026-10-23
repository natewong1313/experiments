import { expect, it } from "vitest";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type {
  AgentEvent,
  ConversationId,
  EntryId,
  EntryRecord,
  MessageChange,
  SnapshotEvent,
} from "@earendil-works/pi-durable";
import { AcpEventUpdates } from "../src/acp-events";
import { operationUpdates, promptEntry } from "../src/operations";

const OPERATION = "operation";

type Block = AssistantMessage["content"][number];

type ToolSlot = SnapshotEvent["tools"][number];

/** What a client knows after a list of updates: text runs, and tool calls in creation order. */
type Folded =
  | { kind: "text" | "thinking"; text: string }
  | { kind: "tool"; toolCallId: string; status: unknown; content: unknown };

const USAGE: Usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

// Pi IDs are numbers with a brand. The guard gives a number the brand without an assertion.
function isEntryId(value: number): value is EntryId {
  return Number.isInteger(value);
}

function isConversationId(value: number): value is ConversationId {
  return Number.isInteger(value);
}

let nextEntry = 1;

function entry(fields: Pick<EntryRecord, "kind"> & Partial<EntryRecord>): EntryRecord {
  const id = nextEntry;
  const conversationId = 1;
  nextEntry += 1;

  if (!isEntryId(id) || !isConversationId(conversationId)) {
    throw new Error("Invalid ID");
  }

  return { id, conversationId, ...fields };
}

function assistant(content: Block[]): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "faux",
    provider: "faux",
    model: "test",
    usage: USAGE,
    stopReason: content.some((block) => block.type === "toolCall") ? "toolUse" : "stop",
    timestamp: 0,
  };
}

function toolResult(toolCallId: string, text: string): EntryRecord {
  return entry({
    kind: "pi.toolResult",
    model: [
      {
        role: "toolResult",
        toolCallId,
        toolName: "read",
        content: [{ type: "text", text }],
        isError: false,
        timestamp: 0,
      },
    ],
  });
}

function snapshotOf(entries: EntryRecord[], tools: ToolSlot[] = []): SnapshotEvent {
  return {
    type: "snapshot",
    entries: [entry({ kind: "acp.prompt", data: promptEntry(OPERATION).data }), ...entries],
    tools,
    nestedTools: [],
    compactions: [],
    inbox: [],
    agent: {},
    usage: { models: {}, tools: {} },
  };
}

/** Returns the live events of an assistant message that streams its text and thinking. */
function streamed(message: AssistantMessage, committed: EntryRecord): AgentEvent[] {
  const changes = message.content.flatMap((block, contentIndex): MessageChange[] => {
    if (block.type === "text") {
      return [{ type: "text_delta", contentIndex, delta: block.text }];
    }

    return block.type === "thinking"
      ? [{ type: "thinking_delta", contentIndex, delta: block.thinking }]
      : [];
  });

  return [
    { type: "message_start", message },
    { type: "message_update", usage: USAGE, changes },
    { type: "message_end", entry: committed },
  ];
}

function liveUpdates(events: AgentEvent[]): SessionUpdate[] {
  const updates = new AcpEventUpdates();

  return events.flatMap((event) => updates.update(event));
}

/** Folds updates as a client does: text joins the run of its kind, and tool updates merge. */
function fold(updates: SessionUpdate[]): Folded[] {
  const folded: Folded[] = [];

  for (const update of updates) {
    if (
      update.sessionUpdate === "agent_message_chunk" ||
      update.sessionUpdate === "agent_thought_chunk"
    ) {
      const kind = update.sessionUpdate === "agent_message_chunk" ? "text" : "thinking";
      const text = update.content.type === "text" ? update.content.text : "";
      const last = folded.at(-1);

      if (last?.kind === kind) {
        last.text += text;
      } else if (text !== "") {
        folded.push({ kind, text });
      }
    }

    if (update.sessionUpdate === "tool_call") {
      if (folded.some((part) => part.kind === "tool" && part.toolCallId === update.toolCallId)) {
        throw new Error("Duplicate tool call");
      }

      folded.push({
        kind: "tool",
        toolCallId: update.toolCallId,
        status: update.status,
        content: update.content,
      });
    }

    if (update.sessionUpdate === "tool_call_update") {
      const tool = folded.find(
        (part) => part.kind === "tool" && part.toolCallId === update.toolCallId,
      );

      if (tool?.kind === "tool") {
        tool.status = update.status ?? tool.status;
        tool.content = update.content ?? tool.content;
      }
    }
  }

  return folded;
}

it("replays text on both sides of a tool call in the order that the live watch sent it", () => {
  const first = assistant([
    { type: "thinking", thinking: "Plan" },
    { type: "text", text: "A" },
    { type: "toolCall", id: "c1", name: "read", arguments: { path: "/a" } },
    { type: "text", text: "B" },
  ]);

  const second = assistant([{ type: "text", text: "C" }]);
  const firstEntry = entry({ kind: "pi.assistant", model: [first] });
  const result = toolResult("c1", "file");
  const secondEntry = entry({ kind: "pi.assistant", model: [second] });

  const live = liveUpdates([
    ...streamed(first, firstEntry),
    { type: "tool_execution_start", toolCallId: "c1", toolName: "read", args: { path: "/a" } },
    { type: "tool_execution_end", toolCallId: "c1", toolName: "read", entry: result },
    ...streamed(second, secondEntry),
  ]);

  const replay = operationUpdates(snapshotOf([firstEntry, result, secondEntry]), OPERATION);

  expect(fold(replay)).toEqual(fold(live));
  expect(fold(live).map((part) => part.kind)).toEqual(["thinking", "text", "tool", "text"]);
});

it("replays a tool call that Pi ended without a result as failed", () => {
  const message = assistant([{ type: "toolCall", id: "c1", name: "read", arguments: {} }]);
  const committed = entry({ kind: "pi.assistant", model: [message] });

  const live = liveUpdates([
    ...streamed(message, committed),
    { type: "tool_execution_start", toolCallId: "c1", toolName: "read", args: {} },
    { type: "tool_execution_end", toolCallId: "c1", toolName: "read" },
  ]);

  const slot: ToolSlot = { callId: "c1", name: "read", status: "done" };
  const replay = operationUpdates(snapshotOf([committed], [slot]), OPERATION);

  expect(fold(replay)).toEqual(fold(live));
  expect(fold(replay)).toMatchObject([{ kind: "tool", status: "failed" }]);
});

it("replays only the tool calls that started, with the output of a running one", () => {
  const message = assistant([
    { type: "text", text: "Reading" },
    { type: "toolCall", id: "c1", name: "read", arguments: {} },
    { type: "toolCall", id: "c2", name: "read", arguments: {} },
  ]);

  const committed = entry({ kind: "pi.assistant", model: [message] });

  const live = liveUpdates([
    ...streamed(message, committed),
    { type: "tool_execution_start", toolCallId: "c1", toolName: "read", args: {} },
    { type: "tool_execution_update", toolCallId: "c1", toolName: "read", output: { set: "par" } },
  ]);

  const slots: ToolSlot[] = [
    { callId: "c1", name: "read", status: "running", output: "par" },
    { callId: "c2", name: "read", status: "pending" },
  ];

  const replay = operationUpdates(snapshotOf([committed], slots), OPERATION);

  expect(fold(replay)).toEqual(fold(live));
  expect(fold(replay).filter((part) => part.kind === "tool")).toHaveLength(1);
});

it("updates a started tool call when Pi starts it again after a restart", () => {
  const slot: ToolSlot = { callId: "c1", name: "read", status: "running" };
  const updates = new AcpEventUpdates(snapshotOf([], [slot]));

  const [again] = updates.update({
    type: "tool_execution_start",
    toolCallId: "c1",
    toolName: "read",
    args: {},
  });

  const [fresh] = updates.update({
    type: "tool_execution_start",
    toolCallId: "c2",
    toolName: "read",
    args: {},
  });

  expect(again).toMatchObject({ sessionUpdate: "tool_call_update", toolCallId: "c1" });
  expect(fresh).toMatchObject({ sessionUpdate: "tool_call", toolCallId: "c2" });
});
