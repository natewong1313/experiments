import { ChangesetStateSchema } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { expectState, initialized, withClient } from "./client";

const uri = process.env.AHP_CHANGESET_URI;

describe("changeset channel", () => {
  it.skipIf(!uri)("subscribes to an expanded changeset URI", async () => {
    const channel = uri!;
    await withClient(async (client) => {
      await initialized(client);
      const subscribed = await client.subscribe(channel);
      const state = expectState(subscribed.result.snapshot, channel, ChangesetStateSchema);
      expect(["computing", "ready", "error"]).toContain(state.status);
    });
  });

  it.skipIf(!uri)("returns typed file edits", async () => {
    const channel = uri!;
    await withClient(async (client) => {
      await initialized(client);
      const subscribed = await client.subscribe(channel);
      const state = expectState(subscribed.result.snapshot, channel, ChangesetStateSchema);
      for (const file of state.files) {
        expect(file.id.length).toBeGreaterThan(0);
        expect("after" in file.edit || "before" in file.edit).toBe(true);
      }
    });
  });
});
