import type { ActionEnvelope } from "@experiments/protocol-schemas/ahp";

export const MAX_TURN_BYTES = 2_097_152;

export const COMPLETION_RESERVE_BYTES = 16_384;

export const MAX_SNAPSHOT_BYTES = 4_194_304;

export const MAX_REPLAY_BYTES = 2_097_152;

export const MAX_HISTORY_PAGE_BYTES = 3_145_728;

export const RESPONSE_RESERVE_BYTES = 65_536;

export const MAX_AGENT_CONNECTIONS = 8;

export const AGENT_IDLE_TIMEOUT_MS = 60_000;

export class MemoryLimitError extends Error {
  override readonly name = "MemoryLimitError";
}

export function checkBytes(bytes: number, limit: number, message: string): void {
  if (bytes > limit) {
    throw new MemoryLimitError(message);
  }
}

export function jsonSize(value: ActionEnvelope): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
