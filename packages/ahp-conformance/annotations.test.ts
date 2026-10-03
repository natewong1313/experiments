import { AnnotationsStateSchema } from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { expectState, initialized, SESSION, sessionSnapshot, test } from "./client";

describe("annotations channel", () => {
  test.skipIf(!SESSION)(
    "subscribes when a session advertises annotations",
    async ({ client, skip }) => {
      await initialized(client);
      const session = await sessionSnapshot(client);
      const summary = session.annotations;
      skip(!summary, "Annotations channel unadvertised");

      if (!summary) {
        return;
      }

      expect(Number.isSafeInteger(summary.annotationCount)).toBe(true);
      expect(Number.isSafeInteger(summary.entryCount)).toBe(true);
      const subscribed = await client.subscribe(summary.resource);

      const state = expectState(
        subscribed.result.snapshot,
        summary.resource,
        AnnotationsStateSchema,
      );

      expect(Array.isArray(state.annotations)).toBe(true);
    },
  );
});
