import type {
  PromptRequest,
  PromptResponse,
  SessionUpdate,
  Usage as ACPUsage,
} from "@agentclientprotocol/sdk";
import type { EntryRecord, SnapshotEvent, ToolSlot } from "@earendil-works/pi-durable";
import type { PiOperationResult } from "agents/harness/pi";
import { messageTextUpdates, toolCallEnd, toolCallOutput, toolCallStart } from "./acp-events";

/**
 * The `_meta` key of a prompt's operation ID. A prompt that repeats an operation ID reattaches to
 * that operation instead of running it again. `initialize` advertises the key in the agent
 * capabilities.
 */
export const OPERATION_ID_META = "agent-host/operationId";

/**
 * The `_meta` key for replay updates of a prompt with an operation ID.
 * Before other prompt updates, the agent replays all operation output so far, in order.
 * The replay includes text, thinking, and tool call updates. Each update has `{ start, end }` under this key.
 * `start` marks the first replay update, and `end` marks the last.
 * A new operation replays one empty `agent_message_chunk`.
 * The client replaces its previous operation output with the replay. Later updates add new output.
 */
export const REPLAY_META = "agent-host/replay";

/** The transcript entry kind of a prompt with an operation ID. Its data holds the ID. */
const PROMPT_ENTRY_KIND = "acp.prompt";

// Pi records typed input under this kind.
const USER_ENTRY_KIND = "pi.user";

/** Returns the operation ID of a prompt, or undefined if the prompt has none. */
export function operationIdOf(params: PromptRequest): string | undefined {
  const operationId = params._meta?.[OPERATION_ID_META];

  return typeof operationId === "string" && operationId !== "" ? operationId : undefined;
}

/** Returns the transcript entry that records a prompt with `operationId`. */
export function promptEntry(operationId: string): {
  kind: string;
  data: { operationId: string };
} {
  return { kind: PROMPT_ENTRY_KIND, data: { operationId } };
}

/**
 * Returns the ACP response of a settled operation, with the token usage of its answers.
 *
 * @throws {Error} If pi did not answer for another reason than an abort.
 */
export function responseOf(result: PiOperationResult, usage?: ACPUsage): PromptResponse {
  if (result.status === "done") {
    return { stopReason: "end_turn", ...(usage && { usage }) };
  }

  if (result.reason === "aborted") {
    return { stopReason: "cancelled", ...(usage && { usage }) };
  }

  throw new Error(result.reason ?? "Pi did not answer the prompt");
}

/** Marks `updates` as the replay of an operation. An empty replay is one empty text chunk. */
export function replayUpdates(updates: readonly SessionUpdate[]): SessionUpdate[] {
  const replayed: SessionUpdate[] =
    updates.length === 0
      ? [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "" } }]
      : [...updates];

  return replayed.map((update, index) => ({
    ...update,
    _meta: { [REPLAY_META]: { start: index === 0, end: index === replayed.length - 1 } },
  }));
}

/**
 * Returns the output of the operation with `operationId` in `snapshot` as ACP updates, in the
 * order that the live event watch sends them. Each assistant message gives its text and thinking
 * in block order, then its tool calls. A started tool call appears with its result, or as failed
 * if Pi ended it without a result. A running tool call appears with its output so far, and a
 * tool call that waits to start appears when it starts. The generation in flight comes last.
 */
export function operationUpdates(snapshot: SnapshotEvent, operationId: string): SessionUpdate[] {
  const answers = operationAnswers(snapshot.entries, operationId);

  if (!answers) {
    return [];
  }

  const results = new Map<string, EntryRecord>();

  for (const entry of answers.entries) {
    const message = entry.model?.[0];

    if (message?.role === "toolResult") {
      results.set(message.toolCallId, entry);
    }
  }

  // The tool slots and the generation in flight belong to the newest input of the run.
  const slots = new Map(answers.current ? snapshot.tools.map((slot) => [slot.callId, slot]) : []);
  const updates = answers.entries.flatMap((entry) => answerUpdates(entry, results, slots));
  const inFlight = answers.current ? snapshot.generation?.message : undefined;

  return inFlight ? [...updates, ...messageTextUpdates(inFlight)] : updates;
}

/** Returns the token usage of the committed answers of an operation, or undefined if none. */
export function operationUsage(
  entries: readonly EntryRecord[],
  operationId: string,
): ACPUsage | undefined {
  const messages = (operationAnswers(entries, operationId)?.entries ?? [])
    .flatMap((entry) => entry.model ?? [])
    .filter((message) => message.role === "assistant");

  if (messages.length === 0) {
    return;
  }

  const total = (pick: (usage: (typeof messages)[number]["usage"]) => number | undefined): number =>
    messages.reduce((sum, message) => sum + (pick(message.usage) ?? 0), 0);

  return {
    totalTokens: total((usage) => usage.totalTokens),
    inputTokens: total((usage) => usage.input),
    outputTokens: total((usage) => usage.output),
    thoughtTokens: total((usage) => usage.reasoning),
    cachedReadTokens: total((usage) => usage.cacheRead),
    cachedWriteTokens: total((usage) => usage.cacheWrite),
  };
}

/**
 * Returns the entries after the prompt of an operation up to the next input, and whether no
 * input follows them. Returns undefined if the transcript has no such prompt.
 */
function operationAnswers(
  entries: readonly EntryRecord[],
  operationId: string,
): { entries: EntryRecord[]; current: boolean } | undefined {
  const start = entries.findIndex((entry) => isPromptOf(entry, operationId));

  if (start === -1) {
    return;
  }

  const later = entries.slice(start + 1);
  const next = later.findIndex(isInput);

  return next === -1
    ? { entries: later, current: true }
    : { entries: later.slice(0, next), current: false };
}

/**
 * Returns the updates of a committed assistant message: its text and thinking, then the tool
 * calls that started. Other entries give no updates, because their tool calls give the results.
 */
function answerUpdates(
  entry: EntryRecord,
  results: ReadonlyMap<string, EntryRecord>,
  slots: ReadonlyMap<string, ToolSlot>,
): SessionUpdate[] {
  const message = entry.model?.[0];

  if (message?.role !== "assistant") {
    return [];
  }

  const calls = message.content.flatMap((block) => {
    if (block.type !== "toolCall") {
      return [];
    }

    const result = results.get(block.id);
    const slot = slots.get(block.id);
    const start = toolCallStart(block.id, block.name, block.arguments);

    // Pi ends a faulted or orphaned call without a result entry, which is a failure.
    if (result || slot?.status === "done") {
      return [start, toolCallEnd(block.id, result)];
    }

    if (slot?.status !== "running") {
      return [];
    }

    return slot.output === undefined
      ? [start]
      : [start, toolCallOutput(block.id, slot.output, slot.details)];
  });

  return [...messageTextUpdates(message), ...calls];
}

function isPromptOf(entry: EntryRecord, operationId: string): boolean {
  if (entry.kind !== PROMPT_ENTRY_KIND) {
    return false;
  }

  const { data } = entry;

  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    data.operationId === operationId
  );
}

function isInput(entry: EntryRecord): boolean {
  return entry.kind === PROMPT_ENTRY_KIND || entry.kind === USER_ENTRY_KIND;
}
