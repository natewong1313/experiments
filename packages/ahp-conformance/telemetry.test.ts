import { describe, expect } from "vitest";
import { initialized, ROOT, test } from "./client";

const SIGNALS = ["logs", "traces", "metrics"] as const;

describe("telemetry channels", () => {
  for (const signal of SIGNALS) {
    test(`subscribes to advertised ${signal} telemetry without a state snapshot`, async ({
      client,
      skip,
    }) => {
      const init = await initialized(client);
      const { telemetry } = init;
      const advertised = telemetry?.[signal];
      skip(!advertised, "Telemetry unadvertised");
      if (!advertised) {
        return;
      }
      const concrete = expandLevelTemplate(advertised);
      expect(concrete.startsWith("ahp-otlp:")).toBe(true);
      const subscribed = await client.subscribe(concrete);
      expect(subscribed.result.snapshot).toBeUndefined();
    });
  }

  test("advertises only telemetry URI schemes", async ({ client }) => {
    const init = await initialized(client, [ROOT]);
    const { telemetry } = init;
    if (!telemetry) {
      return;
    }
    for (const uri of Object.values(telemetry)) {
      if (!uri) {
        continue;
      }
      expect(uri.startsWith("ahp-otlp:")).toBe(true);
    }
  });
});

function expandLevelTemplate(uri: string): string {
  return uri.replace("{?level}", "?level=info").replace("{level}", "info");
}
