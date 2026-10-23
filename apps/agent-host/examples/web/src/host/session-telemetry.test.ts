import { afterEach, expect, it, vi } from "vitest";

import type { HarnessOptions } from "@earendil-works/pi-durable";

import { sessionTelemetry } from "./session-telemetry";

type Telemetry = NonNullable<HarnessOptions["telemetry"]>;

type Span = Parameters<Parameters<Telemetry["startSpan"]>[1]>[0];

function modelRequest(span: Span): string {
  span.addEvent("pi.ai.first_chunk");
  span.setAttributes({ "usage.output": 10 });
  span.setStatus({ status: "ok" });

  return "model result";
}

afterEach(() => {
  vi.restoreAllMocks();
});

it("logs model timing and child spans without changing the result", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const telemetry = sessionTelemetry("host/session");

  const result = await telemetry.startSpan(
    { name: "pi.generation" },
    async (parent) =>
      await parent.startSpan(
        { name: "pi.ai.request", attributes: { model: "glm-5.3" } },
        modelRequest,
      ),
  );

  expect(result).toBe("model result");
  expect(log).toHaveBeenCalledWith(
    "Agent timing",
    expect.objectContaining({
      sessionId: "host/session",
      span: "pi.ai.request",
      event: "span_start",
      attributes: { model: "glm-5.3" },
    }),
  );
  expect(log).toHaveBeenCalledWith(
    "Agent timing",
    expect.objectContaining({ event: "pi.ai.first_chunk" }),
  );
});

it("ends the span and preserves request failures", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const failure = new Error("Provider failed");
  await expect(
    sessionTelemetry("host/session").startSpan({ name: "pi.ai.request" }, () => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(log).toHaveBeenLastCalledWith(
    "Agent timing",
    expect.objectContaining({ event: "span_end" }),
  );
});
