import type { HostSessionEntry } from "../src/shared/rpc/host";
import { buildSession, sessionSummary } from "../src/session/state";
import type { NewSession, NewSessionRows } from "../src/session/state";

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

/** Returns the rows of a new session that are not stored. */
export function newRecord(values: Partial<NewSession> = {}): NewSessionRows {
  return buildSession({
    sessionId: crypto.randomUUID(),
    chatId: crypto.randomUUID(),
    provider: "test",
    createdAt: new Date().toISOString(),
    cwd: "/",
    ...values,
  });
}

/** Returns the catalog entry of a new session that is not stored. */
export function newEntry(values: Partial<NewSession> = {}): HostSessionEntry {
  const { session, chat } = newRecord(values);

  return {
    sessionId: session.id,
    defaultChat: chat.summary.resource,
    revision: 0,
    summary: sessionSummary(session, chat.summary),
  };
}
