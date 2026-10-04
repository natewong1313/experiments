import {
  InitializeResultSchema,
  ReconnectResultSchema,
  SubscribeResultSchema,
  type ActionEnvelope,
  type ReconnectResult,
} from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import {
  endpoint,
  expectRootState,
  expectSessionState,
  initialized,
  MUTATIONS,
  ROOT,
  SESSION,
  sessionUri,
  test,
  VERSION,
  withClient,
} from "./client";
import { AhpConnection, initialize } from "./raw";
import { withCleanup } from "./cleanup";

describe("subscriptions and reconnection", () => {
  test("subscribes to root after initialize", async ({ client }) => {
    await initialized(client);
    const subscribed = await client.subscribe(ROOT);
    expectRootState(subscribed.result.snapshot);
  });

  test("accepts an immediate-delivery preference", async ({ client }) => {
    await initialized(client);
    const subscribed = await client.subscribe(ROOT, {
      delivery: { maxLatencyMs: 0 },
    });
    expectRootState(subscribed.result.snapshot);
  });

  test("allows resubscription after unsubscribe", async ({ client }) => {
    await initialized(client, [ROOT]);
    await client.unsubscribe(ROOT);
    await client.ping();
    const subscribed = await client.subscribe(ROOT);
    expectRootState(subscribed.result.snapshot);
  });

  test("exposes the same agents to two simultaneous subscribers", async ({
    client,
  }) => {
    const first = await initialized(client, [ROOT]);
    const firstState = expectRootState(first.snapshots[0]);
    await withClient(async (second) => {
      const result = await initialized(second, [ROOT]);
      const secondState = expectRootState(result.snapshots[0]);
      expect(secondState.agents).toEqual(firstState.agents);
      await client.ping();
      await second.ping();
    });
  });

  test("resumes root after the original socket closes", async () => {
    const clientId = `conformance-${crypto.randomUUID()}`;
    const serverSeq = await captureServerSeq(clientId, [ROOT]);
    await withClient(async (fresh) => {
      const result = ReconnectResultSchema.parse(
        await fresh.reconnect({
          clientId,
          lastSeenServerSeq: serverSeq,
          subscriptions: [ROOT],
        }),
      );
      const missing = result.type === "replay" ? result.missing : [];
      expect(missing).not.toContain(ROOT);
      if (result.type === "snapshot") {
        expectRootState(
          result.snapshots.find((snapshot) => snapshot.resource === ROOT),
        );
      }
      await fresh.ping();
    });
  });

  test.skipIf(!SESSION || !MUTATIONS)(
    "recovers a known update missed while disconnected",
    async () => {
      const uri = sessionUri();
      const clientId = `conformance-${crypto.randomUUID()}`;
      const serverSeq = await captureServerSeq(clientId, [ROOT, uri]);
      const writer = await AhpConnection.open(endpoint());
      try {
        await initialize(writer, [uri]);
        const subscribed = await writer.request("subscribe", { channel: uri });
        if (!("result" in subscribed)) {
          throw new Error("Fixture session subscription failed");
        }
        const { snapshot } = SubscribeResultSchema.parse(subscribed.result);
        const original = expectSessionState(snapshot, uri).title;
        const changed = `AHP reconnect ${crypto.randomUUID()}`;
        await withCleanup(
          async () => {
            const after = writer.checkpoint;
            writer.notify("dispatchAction", {
              channel: uri,
              clientSeq: 1,
              action: { type: "session/titleChanged", title: changed },
            });
            const accepted = await writer.waitForAction(
              uri,
              "session/titleChanged",
              {
                after,
                predicate: (envelope) =>
                  envelope.origin?.clientSeq === 1 &&
                  envelope.action.type === "session/titleChanged" &&
                  envelope.action.title === changed,
              },
            );
            expect(accepted.rejectionReason).toBeUndefined();
            await withClient(async (fresh) => {
              const recovered = ReconnectResultSchema.parse(
                await fresh.reconnect({
                  clientId,
                  lastSeenServerSeq: serverSeq,
                  subscriptions: [ROOT, uri],
                }),
              );
              if (recovered.type === "replay") {
                expectReplayRecovery(recovered, serverSeq, accepted);
              } else {
                const recoveredSnapshot = recovered.snapshots.find(
                  (item) => item.resource === uri,
                );
                expectSnapshotTitle(recoveredSnapshot, uri, changed);
              }
              const current = await fresh.subscribe(uri);
              expect(
                expectSessionState(current.result.snapshot, uri).title,
              ).toBe(changed);
              await fresh.ping();
            });
          },
          async () => {
            const after = writer.checkpoint;
            writer.notify("dispatchAction", {
              channel: uri,
              clientSeq: 2,
              action: { type: "session/titleChanged", title: original },
            });
            const restored = await writer.waitForAction(
              uri,
              "session/titleChanged",
              {
                after,
                predicate: (envelope) =>
                  envelope.origin?.clientSeq === 2 &&
                  envelope.action.type === "session/titleChanged" &&
                  envelope.action.title === original,
              },
            );
            expect(restored.rejectionReason).toBeUndefined();
          },
        );
      } finally {
        await writer.close();
      }
    },
  );

  test("accepts a fresh initialize after another client closes", async () => {
    await withClient(async (first) => {
      await initialized(first);
    });
    await withClient(async (fresh) => {
      const result = await initialized(fresh);
      expect(result.protocolVersion).toBe(VERSION);
    });
  });
});

async function captureServerSeq(
  clientId: string,
  subscriptions: string[],
): Promise<number> {
  return await withClient(async (client) => {
    const result = InitializeResultSchema.parse(
      await client.initialize({
        clientId,
        protocolVersions: [VERSION],
        initialSubscriptions: subscriptions,
      }),
    );
    return result.serverSeq;
  });
}

function expectReplayRecovery(
  result: Extract<ReconnectResult, { type: "replay" }>,
  since: number,
  accepted: ActionEnvelope,
): void {
  expect(result.missing).not.toContain(accepted.channel);
  let previous = since;
  for (const envelope of result.actions) {
    expect(envelope.serverSeq).toBeGreaterThan(previous);
    previous = envelope.serverSeq;
  }
  const missed = result.actions.find(
    (envelope) =>
      envelope.channel === accepted.channel &&
      envelope.serverSeq === accepted.serverSeq,
  );
  expect(missed).toEqual(accepted);
}

function expectSnapshotTitle(
  snapshot: unknown,
  uri: string,
  title: string,
): void {
  expect(expectSessionState(snapshot, uri).title).toBe(title);
}
