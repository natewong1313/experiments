import { describe, expect, it } from "vitest";
import {
  ActionEnvelopeSchema,
  InitializeResultSchema,
  JsonRpcNotificationSchema,
  JsonRpcReplySchema,
  RootStateSchema,
  ResourceResolveResultSchema,
  SnapshotSchema,
  TerminalStateSchema,
} from "../src/ahp/index";

describe("jsonrpc frames", () => {
  it("parses a success reply", () => {
    const parsed = JsonRpcReplySchema.safeParse({ jsonrpc: "2.0", id: 1, result: {} });
    expect(parsed.success).toBe(true);
  });

  it("parses a failure reply", () => {
    const parsed = JsonRpcReplySchema.safeParse({
      jsonrpc: "2.0",
      id: 7,
      error: { code: -32_001, message: "Session not found" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a frame carrying both result and error", () => {
    const parsed = JsonRpcReplySchema.safeParse({
      jsonrpc: "2.0",
      id: 7,
      result: {},
      error: { code: -32_001, message: "Session not found" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a frame with a wrong protocol version", () => {
    const parsed = JsonRpcReplySchema.safeParse({ jsonrpc: "1.0", id: 1, result: {} });
    expect(parsed.success).toBe(false);
  });

  it("recognizes notifications without an id", () => {
    const notification = JsonRpcNotificationSchema.safeParse({
      jsonrpc: "2.0",
      method: "action",
      params: {},
    });
    expect(notification.success).toBe(true);
    const reply = JsonRpcNotificationSchema.safeParse({
      jsonrpc: "2.0",
      id: 1,
      method: "action",
      params: {},
    });
    expect(reply.success).toBe(false);
  });
});

describe("snapshot and envelope strictness", () => {
  const rootSnapshot = {
    resource: "ahp-root://",
    fromSeq: 0,
    state: { agents: [] },
  };

  it("parses a root snapshot", () => {
    const parsed = SnapshotSchema.safeParse(rootSnapshot);
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown key on the snapshot envelope", () => {
    const parsed = SnapshotSchema.safeParse({ ...rootSnapshot, extra: true });
    expect(parsed.success).toBe(false);
  });

  it("rejects a state with undeclared fields", () => {
    const parsed = SnapshotSchema.safeParse({
      ...rootSnapshot,
      state: { agents: [], undeclared: "value" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a negative or fractional sequence number", () => {
    const parsed = SnapshotSchema.safeParse({ ...rootSnapshot, fromSeq: -1 });
    expect(parsed.success).toBe(false);
  });

  it("rejects a state matching no channel schema", () => {
    const parsed = SnapshotSchema.safeParse({
      resource: "ahp-root://",
      fromSeq: 0,
      state: { something: "else" },
    });
    expect(parsed.success).toBe(false);
  });

  it("parses an action envelope with a session action", () => {
    const parsed = ActionEnvelopeSchema.safeParse({
      channel: "ahp-session:/abc",
      serverSeq: 5,
      action: { type: "session/titleChanged", title: "hello" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown action type", () => {
    const parsed = ActionEnvelopeSchema.safeParse({
      channel: "ahp-session:/abc",
      serverSeq: 5,
      action: { type: "session/notARealAction", title: "hello" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an action payload missing a required field", () => {
    const parsed = ActionEnvelopeSchema.safeParse({
      channel: "ahp-session:/abc",
      serverSeq: 5,
      action: { type: "session/titleChanged" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a rejection reason on an unknown envelope key", () => {
    const parsed = ActionEnvelopeSchema.safeParse({
      channel: "ahp-session:/abc",
      serverSeq: 5,
      action: { type: "session/titleChanged", title: "x" },
      rejectionReason: "denied",
      unexpected: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("channel states", () => {
  it("parses a terminal state with command parts", () => {
    const parsed = TerminalStateSchema.safeParse({
      title: "sh",
      content: [
        { type: "unclassified", value: "$ " },
        {
          type: "command",
          commandId: "c1",
          commandLine: "ls",
          output: "",
          timestamp: 1_700_000_000_000,
          isComplete: false,
        },
      ],
      lifecycle: { status: "running" },
      claim: { kind: "client", clientId: "cli" },
    });
    expect(parsed.success).toBe(true);
  });

  it("parses root state with agent capabilities", () => {
    const parsed = RootStateSchema.safeParse({
      agents: [
        {
          provider: "echo",
          displayName: "Echo",
          description: "Echo agent",
          models: [{ id: "m", provider: "echo", name: "Model" }],
          capabilities: { multipleChats: { fork: true } },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a terminal claim with an unknown kind", () => {
    const parsed = TerminalStateSchema.safeParse({
      title: "sh",
      content: [],
      lifecycle: { status: "running" },
      claim: { kind: "robot", clientId: "cli" },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("command results", () => {
  it("parses an initialize result with snapshots and telemetry", () => {
    const parsed = InitializeResultSchema.safeParse({
      protocolVersion: "0.9.0",
      serverSeq: 0,
      snapshots: [
        { resource: "ahp-root://", fromSeq: 0, state: { agents: [] } },
      ],
      telemetry: { logs: "ahp-otlp:/logs" },
    });
    expect(parsed.success).toBe(true);
  });

  it("parses a resource resolve result", () => {
    const parsed = ResourceResolveResultSchema.safeParse({
      uri: "file:///workspace/hello.txt",
      type: "file",
      size: 5,
      mtime: "2026-01-15T12:34:56.789Z",
      etag: "W/5-abc123",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an initialize result with an invalid timestamp in a summary", () => {
    const parsed = InitializeResultSchema.safeParse({
      protocolVersion: "0.9.0",
      serverSeq: 0,
      snapshots: [],
      telemetry: { logs: "ahp-otlp:/logs/{level}" },
      createdAt: "not-a-date",
    });
    expect(parsed.success).toBe(false);
  });
});
