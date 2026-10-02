import { ResourceWatchStateSchema } from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { expectState, initialized, test } from "./client";

const directory = process.env.AHP_WATCH_DIRECTORY_URI;

describe("resource watch channel", () => {
  test.skipIf(!directory)(
    "creates and subscribes to a watch",
    async ({ client }) => {
      const watched = directory!;
      await initialized(client);
      const watch = await client.createResourceWatch({ uri: watched });
      expect(watch.channel.startsWith("ahp-resource-watch:/")).toBe(true);

      try {
        const subscribed = await client.subscribe(watch.channel);
        expectState(
          subscribed.result.snapshot,
          watch.channel,
          ResourceWatchStateSchema,
        );
      } finally {
        await client.unsubscribe(watch.channel);
      }
    },
  );

  test.skipIf(!directory)(
    "records the watched URI and recursion choice",
    async ({ client }) => {
      const watched = directory!;
      await initialized(client);

      const watch = await client.createResourceWatch({
        uri: watched,
        recursive: true,
      });

      try {
        const subscribed = await client.subscribe(watch.channel);

        const state = expectState(
          subscribed.result.snapshot,
          watch.channel,
          ResourceWatchStateSchema,
        );

        expect(state.root).toBe(watched);
        expect(state.recursive).toBe(true);
      } finally {
        await client.unsubscribe(watch.channel);
      }
    },
  );
});
