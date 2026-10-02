import { ChangesetStateSchema } from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { expectState, initialized, test } from "./client";

const uri = process.env.AHP_CHANGESET_URI;

describe("changeset channel", () => {
  test.skipIf(!uri)(
    "subscribes to an expanded changeset URI",
    async ({ client }) => {
      const channel = uri!;
      await initialized(client);
      const subscribed = await client.subscribe(channel);

      const state = expectState(
        subscribed.result.snapshot,
        channel,
        ChangesetStateSchema,
      );

      expect(["computing", "ready", "error"]).toContain(state.status);
    },
  );

  test.skipIf(!uri)("returns typed file edits", async ({ client }) => {
    const channel = uri!;
    await initialized(client);
    const subscribed = await client.subscribe(channel);

    const state = expectState(
      subscribed.result.snapshot,
      channel,
      ChangesetStateSchema,
    );

    for (const file of state.files) {
      expect(file.id.length).toBeGreaterThan(0);
      expect("after" in file.edit || "before" in file.edit).toBe(true);
    }
  });
});
