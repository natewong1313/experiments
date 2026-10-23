import type { PromptRequest, PromptResponse, SessionUpdate } from "@agentclientprotocol/sdk";
import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { EntryRecord, SnapshotEvent } from "@earendil-works/pi-durable";
import type { PiOperationResult } from "agents/harness/pi";

/**
 * The `_meta` key of a prompt's operation ID. A prompt that repeats an operation ID reattaches to
 * that operation instead of running it again. `initialize` advertises the key in the agent
 * capabilities.
 */
export const OPERATION_ID_META = "agent-host/operationId";

/**
 * The `_meta` key of the updates that open a prompt with an operation ID. Before any other
 * update of the prompt, the agent sends all the text of the operation so far as one or more
 * `agent_message_chunk` updates, with `{ start, end }` under this key: `start` on the first
 * chunk and `end` on the last. A new operation sends one empty chunk with both. The client
 * replaces the text that it received for the operation with the replay, and treats each later
 * chunk as new text.
 */
export const REPLAY_META = "agent-host/replay";

/**
 * The most UTF-16 code units in one chunk. JSON escapes one code unit to at most 6 bytes, so a
 * chunk stays far below the 1 MiB frame limit of the transports.
 */
const MAX_CHUNK_LENGTH = 65_536;

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
 * Returns the ACP stop reason of a settled operation.
 *
 * @throws {Error} If pi did not answer for another reason than an abort.
 */
export function stopReasonOf(result: PiOperationResult): PromptResponse {
  if (result.status === "done") {
    return { stopReason: "end_turn" };
  }

  if (result.reason === "aborted") {
    return { stopReason: "cancelled" };
  }

  throw new Error(result.reason ?? "Pi did not answer the prompt");
}

/** Returns the updates that replay all the text of an operation so far. */
export function replayUpdates(text: string): SessionUpdate[] {
  const chunks = textChunks(text);

  return chunks.map((chunk, index) => ({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: chunk },
    _meta: { [REPLAY_META]: { start: index === 0, end: index === chunks.length - 1 } },
  }));
}

/**
 * Splits `text` into chunks of at most `MAX_CHUNK_LENGTH` code units without splitting a
 * surrogate pair. Empty text gives one empty chunk.
 */
export function textChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  do {
    let end = Math.min(start + MAX_CHUNK_LENGTH, text.length);

    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) {
      end -= 1;
    }

    chunks.push(text.slice(start, end));
    start = end;
  } while (start < text.length);

  return chunks;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd8_00 && code <= 0xdb_ff;
}

/**
 * Returns the assistant text of the operation with `operationId` in `snapshot`: the text of the
 * committed answers after its prompt, then the text of the generation in flight. This is the
 * same text that a client received as chunks while the operation ran.
 */
export function operationText(snapshot: SnapshotEvent, operationId: string): string {
  const start = snapshot.entries.findIndex((entry) => isPromptOf(entry, operationId));

  if (start === -1) {
    return "";
  }

  const later = snapshot.entries.slice(start + 1);
  const next = later.findIndex(isInput);
  const answers = next === -1 ? later : later.slice(0, next);
  const committed = answers.flatMap((entry) => entry.model ?? []).map(assistantText);

  // The generation in flight answers the newest input of the run.
  const inFlight = next === -1 ? snapshot.generation?.message : undefined;

  return [...committed, inFlight ? assistantText(inFlight) : ""].join("");
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

function assistantText(message: Message | AssistantMessage): string {
  if (message.role !== "assistant") {
    return "";
  }

  return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}
