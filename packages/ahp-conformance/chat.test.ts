import { describe, expect } from "vitest";
import { chatSnapshot, initialized, SESSION, test } from "./client";

function retainedTurnIds(): string[] | null {
  const fixture = process.env.AHP_RETAINED_TURN_IDS;

  if (!fixture) {
    return null;
  }

  if (!SESSION) {
    throw new Error("AHP_RETAINED_TURN_IDS requires AHP_SESSION_URI");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fixture);
  } catch (error) {
    throw new Error(
      "AHP_RETAINED_TURN_IDS must be a JSON array of ordered retained turn IDs",
      { cause: error },
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("AHP_RETAINED_TURN_IDS must be a nonempty JSON array");
  }

  const ids = parsed.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );

  if (ids.length !== parsed.length) {
    throw new Error(
      "AHP_RETAINED_TURN_IDS must contain only nonempty string IDs",
    );
  }

  if (new Set(ids).size !== ids.length) {
    throw new Error("AHP_RETAINED_TURN_IDS must contain unique IDs");
  }

  return ids;
}

const RETAINED_TURN_IDS = retainedTurnIds();

describe("chat state", () => {
  test.skipIf(!SESSION)(
    "matches the chat title in the session catalogue",
    async ({ client }) => {
      await initialized(client);
      const chat = await chatSnapshot(client);

      const summary = chat.session.chats.find(
        (item) => item.resource === chat.uri,
      );

      if (!summary) {
        throw new Error("Chat missing from session catalogue");
      }

      expect(summary.title).toBe(chat.state.title);
    },
  );

  test.skipIf(!SESSION)(
    "matches the chat status in the session catalogue",
    async ({ client }) => {
      await initialized(client);
      const chat = await chatSnapshot(client);

      const summary = chat.session.chats.find(
        (item) => item.resource === chat.uri,
      );

      if (!summary) {
        throw new Error("Chat missing from session catalogue");
      }

      expect(summary.status).toBe(chat.state.status);
    },
  );

  test.skipIf(!SESSION)(
    "keeps chat working directories within the session set",
    async ({ client }) => {
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
    },
  );

  test.skipIf(RETAINED_TURN_IDS === null)(
    "returns all retained turns without a window (requires AHP_RETAINED_TURN_IDS)",
    async ({ client }) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      expect(chat.state.turns.map((turn) => turn.id)).toEqual(
        RETAINED_TURN_IDS,
      );
    },
  );
});
