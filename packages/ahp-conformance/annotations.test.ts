import { AnnotationsStateSchema } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { expectState, initialized, SESSION, sessionSnapshot, withClient } from "./client";

describe("annotations channel", () => {
  it.skipIf(!SESSION)("subscribes when a session advertises annotations", async (context) => {
    await withClient(async (client) => {
      await initialized(client);
      const session = await sessionSnapshot(client);
      const summary = session.annotations;
      if (!summary) {
        context.skip();
        return;
      }
      expect(Number.isSafeInteger(summary.annotationCount)).toBe(true);
      expect(Number.isSafeInteger(summary.entryCount)).toBe(true);
      const subscribed = await client.subscribe(summary.resource);
      const state = expectState(subscribed.result.snapshot, summary.resource, AnnotationsStateSchema);
      expect(Array.isArray(state.annotations)).toBe(true);
    });
  });
});
