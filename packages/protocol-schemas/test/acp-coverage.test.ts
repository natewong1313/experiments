import { expect, it } from "vitest";
import definition from "@agentclientprotocol/sdk/schema/schema.json";
import * as schemas from "../src/acp/generated";
import { AcpStateSchema, acpUpdateToChatActions, acpUpdateToSessionActions } from "../src/acp";
import type { SessionState } from "../src/ahp";
import { ACP_UPDATES } from "./acp-updates";

it("exports inbound and outbound validators for every published ACP definition", () => {
  const exported = new Set(Object.keys(schemas));

  for (const name of Object.keys(definition.$defs)) {
    expect(exported.has(`${name}Schema`)).toBe(true);
    expect(exported.has(`${name}OutboundSchema`)).toBe(true);
  }
});

it.each(Object.values(ACP_UPDATES))("validates and handles $sessionUpdate", (update) => {
  const notification = schemas.SessionNotificationSchema.parse({
    sessionId: "conversation",
    update,
  });

  const turn = { id: "turn", responseParts: [] };
  const chat = acpUpdateToChatActions(turn, notification);
  const session = acpUpdateToSessionActions({}, notification, "conversation", true);
  expect([...chat, ...session].length).toBeGreaterThan(0);
});

it("preserves inbound extensions and rejects them in outbound payloads", () => {
  const request = {
    sessionId: "session",
    prompt: [{ type: "text", text: "Hello", custom: 1 }],
    custom: true,
  };

  expect(schemas.PromptRequestSchema.parse(request)).toEqual(request);
  expect(schemas.PromptRequestOutboundSchema.safeParse(request).success).toBe(false);
  expect(
    schemas.PromptRequestOutboundSchema.safeParse({
      sessionId: "session",
      prompt: [{ type: "text", text: "Hello", _meta: { custom: true } }],
    }).success,
  ).toBe(true);
});

it("validates file, terminal, MCP, authentication, configuration and elicitation payloads", () => {
  expect(
    schemas.ReadTextFileRequestOutboundSchema.parse({
      sessionId: "session",
      path: "/file",
      line: 1,
      limit: 5,
    }),
  ).toMatchObject({ path: "/file" });
  expect(
    schemas.CreateTerminalRequestSchema.safeParse({ sessionId: "session", command: "sh" }).success,
  ).toBe(true);
  expect(
    schemas.NewSessionRequestOutboundSchema.safeParse({
      cwd: "/workspace",
      mcpServers: [{ type: "http", name: "mcp", url: "https://mcp.example", headers: [] }],
    }).success,
  ).toBe(true);
  expect(schemas.AuthenticateRequestOutboundSchema.safeParse({ methodId: "login" }).success).toBe(
    true,
  );
  expect(
    schemas.SetSessionConfigOptionRequestSchema.safeParse({
      sessionId: "session",
      configId: "thinking",
      type: "boolean",
      value: true,
    }).success,
  ).toBe(true);
  expect(
    schemas.CreateElicitationRequestSchema.safeParse({
      mode: "form",
      message: "Enter name",
      sessionId: "session",
      requestedSchema: { type: "object", properties: { name: { type: "string" } } },
    }).success,
  ).toBe(true);
});

it("rejects malformed known extensible variants and preserves custom payloads", () => {
  expect(
    schemas.CreateElicitationRequestSchema.safeParse({
      mode: "form",
      message: "Enter name",
      sessionId: "session",
    }).success,
  ).toBe(false);
  expect(
    schemas.CreateElicitationRequestSchema.parse({
      mode: "_custom",
      message: "Custom",
      sessionId: "session",
      payload: { value: 1 },
    }),
  ).toEqual({ mode: "_custom", message: "Custom", sessionId: "session", payload: { value: 1 } });
  expect(
    schemas.CreateElicitationRequestOutboundSchema.parse({
      mode: "_custom",
      message: "Custom",
      sessionId: "session",
      payload: { value: 1 },
    }),
  ).toEqual({ mode: "_custom", message: "Custom", sessionId: "session", payload: { value: 1 } });
  expect(schemas.ProtocolVersionSchema.safeParse(65_536).success).toBe(false);
  expect(
    schemas.SessionNotificationSchema.safeParse({
      sessionId: "session",
      update: { sessionUpdate: "tool_call" },
    }).success,
  ).toBe(false);
});

it("applies plan removal, compaction patches and message identity semantics", () => {
  let state: Pick<SessionState, "_meta"> = {};

  const updates = [
    ACP_UPDATES.plan_update,
    ACP_UPDATES.plan_removed,
    ACP_UPDATES.compaction_update,
    ACP_UPDATES.compaction_summary_chunk,
    { sessionUpdate: "compaction_update", compactionId: "compaction", status: "completed" },
    ACP_UPDATES.session_message,
    { ...ACP_UPDATES.session_message_chunk, senderSessionId: null, recipientSessionId: null },
  ];

  for (const update of updates) {
    const notification = schemas.SessionNotificationSchema.parse({ sessionId: "session", update });

    for (const action of acpUpdateToSessionActions(state, notification, "session", true)) {
      if (action.type === "session/metaChanged") {
        state = { _meta: action._meta };
      }
    }
  }

  const retained = AcpStateSchema.parse(state["_meta"]?.acp).session;
  expect(retained?.plans).toEqual({});
  expect(retained?.compactions?.compaction).toMatchObject({
    status: "completed",
    summary: [{ type: "text", text: "Summary" }],
  });
  expect(retained?.messages?.message).toMatchObject({
    senderSessionId: "conversation",
    recipientSessionId: "child",
    content: [{ text: "Find details" }, { text: "More details" }],
  });
});
