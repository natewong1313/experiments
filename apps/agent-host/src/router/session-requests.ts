import { AhpErrorCodes as AHPErrorCodes } from "@microsoft/agent-host-protocol";
import type { CreateSessionParams as AHPCreateSessionParams } from "@experiments/protocol-schemas/ahp";
import { callDoRpc } from "../shared/do-rpc";
import { parseChannel } from "../shared/lookups";
import { AHPError } from "../shared/protocol";
import { toAHPError } from "../shared/rpc/errors";
import type { StubFor } from "../shared/stubs";

/** Returns the stub of the session with the session ID. */
type SessionStubs = (sessionId: string) => StubFor<"session">;

/**
 * Sends a create request to the session. The session waits for the host catalog, so
 * `listSessions` has the session when the request resolves. A repeated create joins the
 * creation, so the router can retry the call after a Durable Object reset.
 */
export async function createSession(
  sessions: SessionStubs,
  params: AHPCreateSessionParams,
): Promise<void> {
  const sessionId = sessionIdOf(params.channel);

  await callDoRpc(
    () => sessions(sessionId),
    async (session) => {
      await session.create(params);
    },
  );
}

/**
 * Sends a dispose request to the session. A retry after a retryable failure can find the
 * session absent, because the first attempt finished. Thus `SessionNotFound` after a retry
 * counts as success.
 */
export async function disposeSession(sessions: SessionStubs, channel: string): Promise<void> {
  const sessionId = sessionIdOf(channel);

  await callDoRpc(
    () => sessions(sessionId),
    async (session, attempt) => {
      try {
        await session.dispose();
      } catch (error) {
        const failure = toAHPError(error);

        if (attempt === 1 || failure.code !== AHPErrorCodes.SessionNotFound) {
          throw error;
        }
      }
    },
  );
}

/**
 * Returns the session ID of a session channel.
 *
 * @throws {AHPError} If the channel is not an `ahp-session` channel.
 */
function sessionIdOf(channel: string): string {
  const parsed = parseChannel(channel);

  if (parsed.kind !== "session") {
    throw new AHPError("Expected an ahp-session channel");
  }

  return parsed.sessionId;
}
