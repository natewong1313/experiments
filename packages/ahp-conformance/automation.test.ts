import { AutomationStateSchema } from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { expectState, initialized, test } from "./client";

const AUTOMATIONS = "ahp-automations://";

describe("automation catalogue", () => {
  test("subscribes to the automation catalogue when advertised", async ({
    client,
    skip,
  }) => {
    const init = await initialized(client);
    skip(!init.automations, "Automations unadvertised");
    const subscribed = await client.subscribe(AUTOMATIONS);
    const state = expectState(
      subscribed.result.snapshot,
      AUTOMATIONS,
      AutomationStateSchema,
    );
    expect(Array.isArray(state.entries)).toBe(true);
  });

  test("uses automation URIs and operation lists", async ({ client, skip }) => {
    const init = await initialized(client);
    skip(!init.automations, "Automations unadvertised");
    const subscribed = await client.subscribe(AUTOMATIONS);
    const state = expectState(
      subscribed.result.snapshot,
      AUTOMATIONS,
      AutomationStateSchema,
    );
    for (const entry of state.entries) {
      expect(entry.resource.startsWith("ahp-automation:/")).toBe(true);
      expect(entry.operations.length).toBeGreaterThan(0);
    }
  });

  test("uses valid timestamps on automation entries", async ({
    client,
    skip,
  }) => {
    const init = await initialized(client);
    skip(!init.automations, "Automations unadvertised");
    const subscribed = await client.subscribe(AUTOMATIONS);
    const state = expectState(
      subscribed.result.snapshot,
      AUTOMATIONS,
      AutomationStateSchema,
    );
    for (const entry of state.entries) {
      expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
      expect(Number.isNaN(Date.parse(entry.modifiedAt))).toBe(false);
    }
  });
});
