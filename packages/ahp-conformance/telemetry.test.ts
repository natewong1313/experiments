import { describe, expect, it } from "vitest";
import { initialized, ROOT, withClient } from "./client";

const SIGNALS = ["logs", "traces", "metrics"] as const;

describe("telemetry channels", () => {
  for (const signal of SIGNALS) {
    it(`subscribes to advertised ${signal} telemetry without a state snapshot`, async (context) => {
      await withClient(async (client) => {
        const init = await initialized(client);
        const { telemetry } = init;
        const advertised = telemetry?.[signal];
        if (!advertised) {
          context.skip();
          return;
        }
        const concrete = expandLevelTemplate(advertised);
        expect(concrete.startsWith("ahp-otlp:")).toBe(true);
        const subscribed = await client.subscribe(concrete);
        expect(subscribed.result.snapshot).toBeUndefined();
      });
    });
  }

  it("advertises only telemetry URI schemes", async () => {
    await withClient(async (client) => {
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
});

function expandLevelTemplate(uri: string): string {
  return uri.replace("{?level}", "?level=info").replace("{level}", "info");
}
