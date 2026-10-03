import { ListSessionsResultSchema, SubscribeResultSchema } from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { AhpConnection, initialize } from "./raw";
import { withCleanup } from "./cleanup";
import {
  endpoint,
  expectSessionState,
  initialized,
  MUTATIONS,
  SESSION,
  sessionSnapshot,
  sessionUri,
  withClient,
  test,
} from "./client";

describe("session channel", () => {
  test.skipIf(!SESSION)("subscribes to the ready fixture session", async ({ client }) => {
    const uri = sessionUri();
    await initialized(client);
    const subscribed = await client.subscribe(uri);
    const state = expectSessionState(subscribed.result.snapshot, uri);
    expect(state.lifecycle).toBe("ready");
  });

  test.skipIf(!SESSION)("links defaultChat to a listed chat when present", async ({ client }) => {
    await initialized(client);
    const state = await sessionSnapshot(client);
    const { defaultChat } = state;

    if (!defaultChat) {
      return;
    }

    const listed = state.chats.some((chat) => chat.resource === defaultChat);
    expect(listed).toBe(true);
  });

  test.skipIf(!SESSION)("matches the fixture metadata in listSessions", async ({ client }) => {
    await initialized(client);
    const state = await sessionSnapshot(client);

    const page = ListSessionsResultSchema.parse(
      await client.request("listSessions", { channel: "ahp-root://" }),
    );

    const listed = page.items.find((item) => item.resource === SESSION);
    expect(listed?.provider).toBe(state.provider);
    expect(listed?.title).toBe(state.title);
  });

  test.skipIf(!SESSION || !MUTATIONS)(
    "rejects a default chat URI outside the catalogue",
    async () => {
      const uri = sessionUri();
      const connection = await AhpConnection.open(endpoint());

      try {
        await initialize(connection, [uri]);
        const after = connection.checkpoint;
        connection.notify("dispatchAction", {
          channel: uri,
          clientSeq: 1,
          action: {
            type: "session/defaultChatChanged",
            defaultChat: `ahp-chat:/${crypto.randomUUID()}`,
          },
        });

        const envelope = await connection.waitForAction(uri, "session/defaultChatChanged", {
          after,
          predicate: (action) => action.origin?.clientSeq === 1,
        });

        expect(envelope.rejectionReason).toEqual(expect.any(String));
        expect(envelope.rejectionReason).not.toBe("");
      } finally {
        await connection.close();
      }
    },
  );

  test.skipIf(!SESSION || !MUTATIONS)(
    "echoes a title change and exposes it to another client",
    async () => {
      const uri = sessionUri();
      const connection = await AhpConnection.open(endpoint());

      try {
        await initialize(connection);

        const subscribed = await connection.request("subscribe", {
          channel: uri,
        });

        if (!("result" in subscribed)) {
          throw new Error("Fixture session has no snapshot");
        }

        const { snapshot } = SubscribeResultSchema.parse(subscribed.result);

        if (!snapshot) {
          throw new Error("Fixture session has no snapshot");
        }

        const state = expectSessionState(snapshot, uri);
        const original = state.title;
        const changed = `AHP conformance ${crypto.randomUUID()}`;
        await withCleanup(
          async () => {
            const after = connection.checkpoint;
            connection.notify("dispatchAction", {
              channel: uri,
              clientSeq: 1,
              action: { type: "session/titleChanged", title: changed },
            });

            const envelope = await connection.waitForAction(uri, "session/titleChanged", {
              after,
              predicate: (action) =>
                action.origin?.clientSeq === 1 &&
                action.action.type === "session/titleChanged" &&
                action.action.title === changed,
            });

            expect(envelope.rejectionReason).toBeUndefined();
            await withClient(async (observer) => {
              await initialized(observer);
              const observed = await sessionSnapshot(observer);
              expect(observed.title).toBe(changed);
              await observer.unsubscribe(uri);
              const resubscribed = await observer.subscribe(uri);
              expect(expectSessionState(resubscribed.result.snapshot, uri).title).toBe(changed);
            });
          },
          async () => {
            const after = connection.checkpoint;
            connection.notify("dispatchAction", {
              channel: uri,
              clientSeq: 2,
              action: { type: "session/titleChanged", title: original },
            });

            const restored = await connection.waitForAction(uri, "session/titleChanged", {
              after,
              predicate: (action) =>
                action.origin?.clientSeq === 2 &&
                action.action.type === "session/titleChanged" &&
                action.action.title === original,
            });

            expect(restored.rejectionReason).toBeUndefined();
          },
        );
      } finally {
        await connection.close();
      }
    },
  );
});
