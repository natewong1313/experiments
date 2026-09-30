import { describe, expect, it } from "vitest";
import { chatSnapshot, expectChatState, initialized, SESSION, withClient } from "./client";

describe("chat state", () => {
  it.skipIf(!SESSION)("subscribes to a listed chat", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      expect(chat.state.resource).toBe(chat.uri);
    });
  });

  it.skipIf(!SESSION)("matches the chat title in the session catalogue", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      const summary = chat.session.chats.find((item) => item.resource === chat.uri);
      if (!summary) {

        throw new Error("Chat missing from session catalogue");

      }
      expect(summary.title).toBe(chat.state.title);
    });
  });

  it.skipIf(!SESSION)("matches the chat status in the session catalogue", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      const summary = chat.session.chats.find((item) => item.resource === chat.uri);
      if (!summary) {

        throw new Error("Chat missing from session catalogue");

      }
      expect(summary.status).toBe(chat.state.status);
    });
  });

  it.skipIf(!SESSION)("has a parseable modification time", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      expect(Number.isNaN(Date.parse(chat.state.modifiedAt))).toBe(false);
    });
  });

  it.skipIf(!SESSION)("has a completed-turn array", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      expect(Array.isArray(chat.state.turns)).toBe(true);
    });
  });

  it.skipIf(!SESSION)("gives retained turns identifiers and response parts", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      for (const turn of chat.state.turns) {
        expect(turn.id.length).toBeGreaterThan(0);
        expect(Array.isArray(turn.responseParts)).toBe(true);
      }
    });
  });

  it.skipIf(!SESSION)("uses an opaque string for a history cursor when present", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      const cursor = chat.state.turnsNextCursor;
      if (!cursor) {
        return;
      }
      expect(cursor.length).toBeGreaterThan(0);
    });
  });

  it.skipIf(!SESSION)("gives an active turn an identifier when present", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      const turn = chat.state.activeTurn;
      if (!turn) {
        return;
      }
      expect(turn.id.length).toBeGreaterThan(0);
    });
  });

  it.skipIf(!SESSION)("keeps chat working directories within the session set", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      const directories = chat.state.workingDirectories;
      if (!directories) {
        return;
      }
      const allowed = new Set(chat.session.workingDirectories);
      for (const directory of directories) {
        expect(allowed.has(directory)).toBe(true);
      }
    });
  });

  it.skipIf(!SESSION)("returns all retained turns when no window is requested", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      const subscribed = await client.subscribe(chat.uri);
      const state = expectChatState(subscribed.result.snapshot, chat.uri);
      expect(Array.isArray(state.turns)).toBe(true);
    });
  });
});
