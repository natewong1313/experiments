import { ResourceWatchStateSchema } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { expectState, initialized, withClient } from "./client";

const directory = process.env.AHP_WATCH_DIRECTORY_URI;

describe("resource watch channel", () => {
  it.skipIf(!directory)("creates and subscribes to a watch", async () => {
    const watched = directory!;
    await withClient(async (client) => {
      await initialized(client);
      const watch = await client.createResourceWatch({ uri: watched });
      expect(watch.channel.startsWith("ahp-resource-watch:/")).toBe(true);
      try {
        const subscribed = await client.subscribe(watch.channel);
        expectState(subscribed.result.snapshot, watch.channel, ResourceWatchStateSchema);
      } finally {
        await client.unsubscribe(watch.channel);
      }
    });
  });

  it.skipIf(!directory)("records the watched URI and recursion choice", async () => {
    const watched = directory!;
    await withClient(async (client) => {
      await initialized(client);
      const watch = await client.createResourceWatch({ uri: watched, recursive: true });
      try {
        const subscribed = await client.subscribe(watch.channel);
        const state = expectState(subscribed.result.snapshot, watch.channel, ResourceWatchStateSchema);
        expect(state.root).toBe(watched);
        expect(state.recursive).toBe(true);
      } finally {
        await client.unsubscribe(watch.channel);
      }
    });
  });
});
