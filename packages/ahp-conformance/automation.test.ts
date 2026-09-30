import { AutomationStateSchema } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { expectState, initialized, withClient } from "./client";

const AUTOMATIONS = "ahp-automations://";

describe("automation catalogue", () => {
  it("subscribes to the automation catalogue when advertised", async (context) => {
    await withClient(async (client) => {
      const init = await initialized(client);
      if (!init.automations) {
        context.skip();
      }
      const subscribed = await client.subscribe(AUTOMATIONS);
      const state = expectState(subscribed.result.snapshot, AUTOMATIONS, AutomationStateSchema);
      expect(Array.isArray(state.entries)).toBe(true);
    });
  });

  it("uses automation URIs and operation lists", async (context) => {
    await withClient(async (client) => {
      const init = await initialized(client);
      if (!init.automations) {
        context.skip();
      }
      const subscribed = await client.subscribe(AUTOMATIONS);
      const state = expectState(subscribed.result.snapshot, AUTOMATIONS, AutomationStateSchema);
      for (const entry of state.entries) {
        expect(entry.resource.startsWith("ahp-automation:/")).toBe(true);
        expect(entry.operations.length).toBeGreaterThan(0);
      }
    });
  });

  it("uses valid timestamps on automation entries", async (context) => {
    await withClient(async (client) => {
      const init = await initialized(client);
      if (!init.automations) {
        context.skip();
      }
      const subscribed = await client.subscribe(AUTOMATIONS);
      const state = expectState(subscribed.result.snapshot, AUTOMATIONS, AutomationStateSchema);
      for (const entry of state.entries) {
        expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
        expect(Number.isNaN(Date.parse(entry.modifiedAt))).toBe(false);
      }
    });
  });
});
