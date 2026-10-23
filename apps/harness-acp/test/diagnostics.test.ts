import { expect, it } from "vitest";
import type { AgentEvent } from "@earendil-works/pi-durable";
import { AcpDiagnostics } from "../src/diagnostics";
import type { AcpDiagnostic } from "../src/diagnostics";

const MESSAGE_UPDATE: AgentEvent = {
  type: "message_update",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  changes: [{ type: "thinking_delta", contentIndex: 0, delta: "private model output" }],
};

type DiagnosticRecording = { diagnostics: AcpDiagnostic[]; recorder: AcpDiagnostics };

/** Returns a recorder that collects the diagnostics of the session `test-session`. */
function recordedDiagnostics(): DiagnosticRecording {
  const diagnostics: AcpDiagnostic[] = [];

  const acp = new AcpDiagnostics({
    sessionId: "test-session",
    onDiagnostic(diagnostic): void {
      diagnostics.push(diagnostic);
    },
  });

  return { diagnostics, recorder: acp };
}

it("records retries and the first update of each model turn", () => {
  const { diagnostics, recorder: acp } = recordedDiagnostics();

  for (const event of [
    { type: "turn_start" },
    MESSAGE_UPDATE,
    MESSAGE_UPDATE,
    { type: "auto_retry_start", attempt: 1, at: 123, errorMessage: "Provider unavailable" },
    { type: "auto_retry_end", attempt: 1 },
    { type: "deferred_poll", pollAt: 456 },
    { type: "turn_start" },
    MESSAGE_UPDATE,
  ] satisfies AgentEvent[]) {
    acp.record(event);
  }

  acp.recordForwarded("agent_thought_chunk");
  acp.recordForwarded("agent_message_chunk");

  expect(diagnostics.map((diagnostic) => diagnostic.event)).toEqual([
    "turn_start",
    "first_message_update",
    "auto_retry_start",
    "auto_retry_end",
    "deferred_poll",
    "turn_start",
    "first_message_update",
    "first_update_forwarded",
  ]);
  expect(diagnostics).toContainEqual(
    expect.objectContaining({
      event: "auto_retry_start",
      attempt: 1,
      retryAt: 123,
      errorMessage: "Provider unavailable",
    }),
  );
  expect(diagnostics).toContainEqual(
    expect.objectContaining({ event: "first_update_forwarded", updateType: "agent_thought_chunk" }),
  );
  expect(
    diagnostics.every(
      (diagnostic) =>
        diagnostic.sessionId === "test-session" && !Number.isNaN(Date.parse(diagnostic.timestamp)),
    ),
  ).toBe(true);
});

it("records one forwarded update per model turn", () => {
  const { diagnostics, recorder: acp } = recordedDiagnostics();

  acp.record({ type: "message_start", message: { role: "user", content: "", timestamp: 0 } });
  acp.recordForwarded("agent_message_chunk");
  acp.recordForwarded("tool_call");

  expect(diagnostics.map((diagnostic) => diagnostic.event)).toEqual([
    "message_start",
    "first_update_forwarded",
  ]);
});

it("does not hold model content", () => {
  const { diagnostics, recorder: acp } = recordedDiagnostics();

  acp.record(MESSAGE_UPDATE);
  acp.recordForwarded("agent_thought_chunk");

  expect(JSON.stringify(diagnostics)).not.toContain("private model output");
});

it("keeps recording when the callback fails", () => {
  const acp = new AcpDiagnostics({
    sessionId: "test-session",
    onDiagnostic(): void {
      throw new Error("sink unavailable");
    },
  });

  expect(() => {
    acp.record({ type: "turn_start" });
  }).not.toThrow();
});
