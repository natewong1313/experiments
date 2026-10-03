import type { ActionEnvelope } from "@experiments/protocol-schemas/ahp";

const MAX_DOCUMENT_BYTES = 2_097_152;

const COMPLETION_RESERVE_BYTES = 16_384;

const MAX_SNAPSHOT_BYTES = 4_194_304;

const MAX_REPLAY_BYTES = 2_097_152;

const MAX_HISTORY_PAGE_BYTES = 3_145_728;

const RESPONSE_RESERVE_BYTES = 65_536;

const MAX_AGENT_CONNECTIONS = 8;

const AGENT_IDLE_TIMEOUT_MS = 60_000;

class MemoryLimitError extends Error {
  override readonly name = "MemoryLimitError";
}

function checkBytes(bytes: number, limit: number, message: string): void {
  if (bytes > limit) {
    throw new MemoryLimitError(message);
  }
}

function jsonSize(value: ActionEnvelope): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export {
  MAX_DOCUMENT_BYTES,
  COMPLETION_RESERVE_BYTES,
  MAX_SNAPSHOT_BYTES,
  MAX_REPLAY_BYTES,
  MAX_HISTORY_PAGE_BYTES,
  RESPONSE_RESERVE_BYTES,
  MAX_AGENT_CONNECTIONS,
  AGENT_IDLE_TIMEOUT_MS,
  MemoryLimitError,
  checkBytes,
  jsonSize,
};
