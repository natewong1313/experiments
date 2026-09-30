import { SubscribeResultSchema } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { AhpConnection, initialize } from "./raw";
import { endpoint, expectSessionState, initialized, MUTATIONS, SESSION, sessionSnapshot, sessionUri, withClient } from "./client";

describe("session channel", () => {
  it.skipIf(!SESSION)("subscribes to the fixture session", async () => {
    const uri = sessionUri();
    await withClient(async (client) => {
      await initialized(client);
      const subscribed = await client.subscribe(uri);
      const state = expectSessionState(subscribed.result.snapshot, uri);
      expect(["creating", "ready", "failed"]).toContain(state.lifecycle);
    });
  });

  it.skipIf(!SESSION)("has a valid session lifecycle", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      expect(["creating", "ready", "failed"]).toContain(state.lifecycle);
    });
  });

  it.skipIf(!SESSION)("has provider, title, and status fields", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      expect(state.provider.length).toBeGreaterThan(0);
      expect(state.title.length).toBeGreaterThan(0);
      expect(Number.isSafeInteger(state.status)).toBe(true);
    });
  });

  it.skipIf(!SESSION)("has an active client list", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      expect(Array.isArray(state.activeClients)).toBe(true);
    });
  });

  it.skipIf(!SESSION)("has a chat catalogue", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      expect(Array.isArray(state.chats)).toBe(true);
    });
  });

  it.skipIf(!SESSION)("uses chat URIs in the catalogue", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      for (const chat of state.chats) {
        expect(chat.resource.startsWith("ahp-chat:/")).toBe(true);
      }
    });
  });

  it.skipIf(!SESSION)("links defaultChat to a listed chat when present", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      const { defaultChat } = state;
      if (!defaultChat) {
        return;
      }
      const listed = state.chats.some((chat) => chat.resource === defaultChat);
      expect(listed).toBe(true);
    });
  });

  it.skipIf(!SESSION)("matches the fixture title in listSessions", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      const page = await client.request("listSessions", { channel: "ahp-root://" });
      const listed = page.items.find((item) => item.resource === SESSION);
      expect(listed?.provider).toBe(state.provider);
      expect(listed?.title).toBe(state.title);
    });
  });

  it.skipIf(!SESSION)("matches the fixture provider in listSessions", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const state = await sessionSnapshot(client);
      const page = await client.request("listSessions", { channel: "ahp-root://" });
      const listed = page.items.find((item) => item.resource === SESSION);
      expect(listed?.title).toBe(state.title);
    });
  });

  it.skipIf(!SESSION)("returns a fresh snapshot after resubscription", async () => {
    const uri = sessionUri();
    await withClient(async (client) => {
      await initialized(client);
      const first = await sessionSnapshot(client);
      await client.unsubscribe(uri);
      const subscribed = await client.subscribe(uri);
      const second = expectSessionState(subscribed.result.snapshot, uri);
      expect(second.title).toBe(first.title);
    });
  });

  it.skipIf(!SESSION || !MUTATIONS)("rejects a default chat URI outside the catalogue", async () => {
    const uri = sessionUri();
    const connection = await AhpConnection.open(endpoint());
    try {
      await initialize(connection, [uri]);
      const echo = connection.waitForAction(uri, "session/defaultChatChanged");
      connection.notify("dispatchAction", {
        channel: uri, clientSeq: 1,
        action: { type: "session/defaultChatChanged", defaultChat: `ahp-chat:/${crypto.randomUUID()}` },
      });
      const envelope = await echo;
      expect(typeof envelope.rejectionReason).toBe("string");
      expect(envelope.rejectionReason).not.toBe("");
    } finally {
      await connection.close();
    }
  });

  it.skipIf(!SESSION || !MUTATIONS)("echoes a title change and exposes it to another client", async () => {
    const uri = sessionUri();
    const connection = await AhpConnection.open(endpoint());
    try {
      await initialize(connection);
      const subscribed = await connection.request("subscribe", { channel: uri });
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
      const echo = connection.waitForAction(uri, "session/titleChanged");
      connection.notify("dispatchAction", {
        channel: uri, clientSeq: 1,
        action: { type: "session/titleChanged", title: changed },
      });
      try {
        const envelope = await echo;
        expect(envelope.rejectionReason).toBeUndefined();
        const { action } = envelope;
        if (action.type !== "session/titleChanged") {

          throw new Error("Unexpected echoed action");

        }
        expect(action.title).toBe(changed);
        await withClient(async (observer) => {
          await initialized(observer);
          const observed = await sessionSnapshot(observer);
          expect(observed.title).toBe(changed);
        });
      } finally {
        const restored = connection.waitForAction(uri, "session/titleChanged");
        connection.notify("dispatchAction", {
          channel: uri, clientSeq: 2,
          action: { type: "session/titleChanged", title: original },
        });
        const restoredEnvelope = await restored;
        expect(restoredEnvelope.rejectionReason).toBeUndefined();
      }
    } finally {
      await connection.close();
    }
  });
});
