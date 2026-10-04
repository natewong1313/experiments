import {
  SessionStateSchema,
  SubscribeResultSchema,
} from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { endpoint, SESSION, test } from "./client";
import { AhpConnection, initialize } from "./raw";

/**
 * Chat turn-resume validation (AHP 0.9.0).
 *
 * `chat/turnResume` reopens the latest errored turn. The chat validation
 * table requires the server to reject the action when there is no latest
 * errored turn with a resumable final error part, and to echo the rejection
 * with a non-empty `rejectionReason`.
 *
 * The rejection paths need no agent and mutate nothing, so they run against
 * any fixture chat. The happy path (a real resumable error) needs a
 * controllable agent and stays out of scope.
 */

const ROOT = "ahp-root://";

async function defaultChatUri(connection: AhpConnection, fixtureSession: string): Promise<string> {
  const reply = await connection.request("subscribe", { channel: fixtureSession });

  if (!("result" in reply)) {
    throw new Error("Subscribing to the fixture session failed");
  }

  const { snapshot } = SubscribeResultSchema.parse(reply.result);

  if (!snapshot) {
    throw new Error("Subscribing to the fixture session returned no snapshot");
  }

  const state = SessionStateSchema.parse(snapshot.state);

  if (!state.defaultChat) {
    throw new Error("Fixture session has no default chat");
  }

  return state.defaultChat;
}

async function expectTurnResumeRejected(
  connection: AhpConnection,
  chat: string,
  turnId: string,
): Promise<void> {
  const after = connection.checkpoint;

  connection.notify("dispatchAction", {
    channel: chat,
    clientSeq: 1,
    action: { type: "chat/turnResume", turnId },
  });

  const envelope = await connection.waitForAction(chat, "chat/turnResume", {
    after,
    predicate: (action) => action.origin?.clientSeq === 1,
  });

  expect(envelope.rejectionReason).toEqual(expect.any(String));
  expect(envelope.rejectionReason).not.toBe("");
}

describe("chat turn resume validation", () => {
  test.skipIf(!SESSION)("rejects chat/turnResume for an unknown turn", async () => {
    const fixtureSession = SESSION;

    if (!fixtureSession) {
      throw new Error("Fixture session not configured");
    }

    const connection = await AhpConnection.open(endpoint());

    try {
      await initialize(connection, [ROOT]);
      const chat = await defaultChatUri(connection, fixtureSession);

      // Rejection echoes are delivered to chat-channel subscribers.
      await connection.request("subscribe", { channel: chat });

      await expectTurnResumeRejected(connection, chat, `missing-${crypto.randomUUID()}`);
    } finally {
      await connection.close();
    }
  });

  test.skipIf(!SESSION)(
    "rejects chat/turnResume when the chat has no errored turn",
    async () => {
      const fixtureSession = SESSION;

      if (!fixtureSession) {
        throw new Error("Fixture session not configured");
      }

      const connection = await AhpConnection.open(endpoint());

      try {
        await initialize(connection, [ROOT]);
        const chat = await defaultChatUri(connection, fixtureSession);

        // Rejection echoes are delivered to chat-channel subscribers.
        await connection.request("subscribe", { channel: chat });

        await expectTurnResumeRejected(connection, chat, "resume-no-errored-turn");
      } finally {
        await connection.close();
      }
    },
  );
});
