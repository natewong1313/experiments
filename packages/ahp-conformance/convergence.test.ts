import {
  ChatStateSchema,
  InitializeResultSchema,
  SessionStateSchema,
  SubscribeResultSchema,
  type ActionEnvelope,
  type Snapshot,
} from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { endpoint, MUTATIONS, SESSION, sessionUri, test } from "./client";
import { withCleanup } from "./cleanup";
import { AhpConnection, initialize } from "./raw";
import { reduceChatState, reduceSessionState, stripVolatile } from "./reducer";

/**
 * State-model convergence: for a deterministic action, snapshot S0, dispatch
 * the action, wait for the accepted echo, take a fresh-subscribe snapshot S1,
 * and assert `reduce(S0, E) == S1` modulo volatile fields.
 *
 * This is the check that distinguishes a real implementation from a thin
 * sequencer that relays action echoes but never materializes state.
 *
 * These tests mutate the fixture session title and chat draft, so they
 * require `AHP_TEST_MUTATIONS=1` and restore the original value on cleanup.
 */

type AcceptedActionProbe = {
  connection: AhpConnection;
  channel: string;
  type: string;
  clientSeq: number;
  after: number;
};

/**
 * Wire-safe dispatchable actions for this file. Plain literal types keep the
 * raw connection's wire-value contract without schema-type friction.
 */
type DispatchableAction =
  | { type: "session/titleChanged"; title: string }
  | { type: "chat/draftChanged"; draft?: { text: string; origin: { kind: "user" } } };

function snapshotFor(snapshots: readonly Snapshot[], resource: string): Snapshot {
  const match = snapshots.find((snapshot) => snapshot.resource === resource);

  if (!match) {
    throw new Error(`No snapshot for ${resource}`);
  }

  return match;
}

async function fetchSnapshot(connection: AhpConnection, resource: string): Promise<Snapshot> {
  const reply = await connection.request("subscribe", { channel: resource });

  if (!("result" in reply)) {
    throw new Error(`Subscribe to ${resource} failed`);
  }

  const { snapshot } = SubscribeResultSchema.parse(reply.result);

  if (!snapshot) {
    throw new Error(`Subscribe to ${resource} returned no snapshot`);
  }

  expect(snapshot.resource).toBe(resource);

  return snapshot;
}

async function initializeFor(
  connection: AhpConnection,
  subscriptions: string[],
): Promise<ReturnType<typeof InitializeResultSchema.parse>> {
  const reply = await initialize(connection, subscriptions);

  if (!("result" in reply)) {
    throw new Error("Initialize failed");
  }

  return InitializeResultSchema.parse(reply.result);
}

function accepted(
  envelope: ActionEnvelope,
  channel: string,
  type: string,
  clientSeq: number,
): boolean {
  return (
    !("rejectionReason" in envelope) &&
    envelope.channel === channel &&
    envelope.action.type === type &&
    envelope.origin?.clientSeq === clientSeq
  );
}

async function waitForAccepted(probe: AcceptedActionProbe): Promise<ActionEnvelope> {
  const envelope = await probe.connection.waitForAction(probe.channel, probe.type, {
    after: probe.after,
    predicate: (action) => accepted(action, probe.channel, probe.type, probe.clientSeq),
  });

  expect(envelope.rejectionReason).toBeUndefined();

  return envelope;
}

function dispatch(
  connection: AhpConnection,
  channel: string,
  clientSeq: number,
  action: DispatchableAction,
): void {
  connection.notify("dispatchAction", {
    channel,
    clientSeq,
    action,
  });
}

describe("state-model convergence", () => {
  test.skipIf(!SESSION || !MUTATIONS)(
    "session/titleChanged reduces to a fresh snapshot",
    async () => {
      const uri = sessionUri();
      const connection = await AhpConnection.open(endpoint());

      try {
        const init = await initializeFor(connection, [uri]);
        const beforeSnapshot = snapshotFor(init.snapshots, uri);
        const before = SessionStateSchema.parse(beforeSnapshot.state);
        const { title: original } = before;

        // The accepted echo must carry a serverSeq beyond the snapshot it
        // Follows. A snapshot is taken at a serverSeq, and subsequent actions
        // Have a serverSeq greater than fromSeq by specification.
        const { fromSeq } = beforeSnapshot;
        const changed = `AHP convergence ${crypto.randomUUID()}`;
        const { checkpoint } = connection;

        dispatch(connection, uri, 1, { type: "session/titleChanged", title: changed });

        const envelope = await connection.waitForAction(uri, "session/titleChanged", {
          after: checkpoint,
          predicate: (action) =>
            action.action.type === "session/titleChanged" &&
            action.action.title === changed &&
            accepted(action, uri, "session/titleChanged", 1),
        });

        expect(envelope.rejectionReason).toBeUndefined();
        expect(envelope.serverSeq).toBeGreaterThan(fromSeq);

        await withCleanup(
          async () => {
            const afterSnapshot = await fetchSnapshot(connection, uri);
            const after = SessionStateSchema.parse(afterSnapshot.state);
            const expected = reduceSessionState(before, envelope.action);

            // Session states carry no top-level timestamps, so the reduced
            // State must match the fresh snapshot exactly.
            expect(after).toEqual(expected);
          },
          async () => {
            const { checkpoint: restoreCheckpoint } = connection;

            dispatch(connection, uri, 2, {
              type: "session/titleChanged",
              title: original,
            });

            await waitForAccepted({
              connection,
              channel: uri,
              type: "session/titleChanged",
              clientSeq: 2,
              after: restoreCheckpoint,
            });
          },
        );
      } finally {
        await connection.close();
      }
    },
  );

  test.skipIf(!SESSION || !MUTATIONS)(
    "chat/draftChanged sets and then clears the draft",
    async ({ skip }) => {
      const uri = sessionUri();
      const connection = await AhpConnection.open(endpoint());

      try {
        const init = await initializeFor(connection, [uri]);
        const session = SessionStateSchema.parse(snapshotFor(init.snapshots, uri).state);
        const chatUri = session.defaultChat;

        if (!chatUri) {
          throw new Error("Fixture session has no default chat");
        }

        const beforeSnapshot = await fetchSnapshot(connection, chatUri);
        const before = ChatStateSchema.parse(beforeSnapshot.state);
        const { draft: originalDraft } = before;

        // Restoring a pre-existing draft would require replaying its full
        // Wire shape; only run against a chat with no draft to protect the
        // Fixture.
        skip(Boolean(originalDraft), "Fixture chat already has a draft");

        const draft = {
          text: "AHP conformance draft",
          origin: { kind: "user" } as const,
        };

        const { checkpoint: setCheckpoint } = connection;

        dispatch(connection, chatUri, 1, { type: "chat/draftChanged", draft });

        const setEnvelope = await connection.waitForAction(chatUri, "chat/draftChanged", {
          after: setCheckpoint,
          predicate: (action) => accepted(action, chatUri, "chat/draftChanged", 1),
        });

        expect(setEnvelope.rejectionReason).toBeUndefined();

        // The final state must equal S0 with the draft set and then cleared:
        // Two actions in one comparison.
        const { checkpoint: clearCheckpoint } = connection;

        dispatch(connection, chatUri, 2, { type: "chat/draftChanged" });

        const clearEnvelope = await connection.waitForAction(chatUri, "chat/draftChanged", {
          after: clearCheckpoint,
          predicate: (action) => accepted(action, chatUri, "chat/draftChanged", 2),
        });

        expect(clearEnvelope.rejectionReason).toBeUndefined();

        await withCleanup(
          async () => {
            const afterSnapshot = await fetchSnapshot(connection, chatUri);
            const after = ChatStateSchema.parse(afterSnapshot.state);

            const expected = reduceChatState(
              reduceChatState(before, setEnvelope.action),
              clearEnvelope.action,
            );

            expect(stripVolatile(after)).toEqual(stripVolatile(expected));
          },
          async () => {
            // No draft at all was the original state, so clearing restores it.
            const { checkpoint: restoreCheckpoint } = connection;

            dispatch(connection, chatUri, 3, { type: "chat/draftChanged" });

            await waitForAccepted({
              connection,
              channel: chatUri,
              type: "chat/draftChanged",
              clientSeq: 3,
              after: restoreCheckpoint,
            });
          },
        );
      } finally {
        await connection.close();
      }
    },
  );
});
