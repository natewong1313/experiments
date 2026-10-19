import type { SessionRecord } from "../src/session/db/schema";
import { buildSession } from "../src/session/state";
import type { NewSession } from "../src/session/state";

/** Resolves with the error of `operation`, or null if it succeeds. */
export async function failure(operation: Promise<unknown>): Promise<Error | null> {
  try {
    await operation;

    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error("Operation rejected", { cause: error });
  }
}

/** Resolves with the error message of `operation`, or null if it succeeds. */
export async function failureMessage(operation: Promise<unknown>): Promise<string | null> {
  const error = await failure(operation);

  return error?.message ?? null;
}

/** Returns a new session record that is not stored. */
export function newRecord(values: Partial<NewSession> = {}): SessionRecord {
  return buildSession({
    sessionId: crypto.randomUUID(),
    chatId: crypto.randomUUID(),
    provider: "test",
    createdAt: new Date().toISOString(),
    cwd: "/",
    ...values,
  });
}
