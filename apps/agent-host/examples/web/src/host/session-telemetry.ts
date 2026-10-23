import type { HarnessOptions } from "@earendil-works/pi-durable";

type TelemetryContext = NonNullable<HarnessOptions["telemetry"]>;

type TelemetrySpan = Parameters<Parameters<TelemetryContext["startSpan"]>[1]>[0];

type TimingDetails = {
  attributes?: Parameters<TelemetrySpan["setAttributes"]>[0];
  status?: Parameters<TelemetrySpan["setStatus"]>[0];
};

export function sessionTelemetry(sessionId: string, parentId?: string): TelemetryContext {
  return {
    async startSpan(options, run) {
      const spanId = crypto.randomUUID();
      const startedAt = Date.now();
      const children = sessionTelemetry(sessionId, spanId);

      function emit(event: string, details: TimingDetails = {}): void {
        console.info("Agent timing", {
          sessionId,
          spanId,
          parentId,
          span: options.name,
          event,
          timestamp: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt,
          ...details,
        });
      }

      const span: TelemetrySpan = {
        ...children,
        addLink(link): void {
          emit("span_link", { attributes: link.attributes });
        },
        addEvent(name, attributes): void {
          emit(name, { attributes });
        },
        setAttributes(attributes): void {
          emit("span_attributes", { attributes });
        },
        setStatus(status): void {
          emit("span_status", { status });
        },
      };

      emit("span_start", { attributes: options.attributes });

      try {
        return await run(span);
      } finally {
        emit("span_end");
      }
    },
  };
}
