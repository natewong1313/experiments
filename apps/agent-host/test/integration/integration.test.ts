import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { AhpClient } from "@microsoft/agent-host-protocol/client";
import type { Subscription } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import { ActionType, MessageKind, PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import {
  ChatActionSchema,
  ChatStateSchema,
  SessionStateSchema,
  type ChatAction,
} from "@experiments/protocol-schemas/ahp";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { AgentSession } from "./worker";
import type { DurableObjectNamespace as WorkerNamespace } from "@cloudflare/workers-types";

type TestEnv = {
  AGENT_SESSION: WorkerNamespace<AgentSession>;
};

const server = createTestHarness({
  workers: [{ configPath: "./test/integration/wrangler.jsonc" }],
});

const worker = server.getWorker<TestEnv>();
const clients: AhpClient[] = [];

beforeAll(async () => {
  await server.listen();
});

afterEach(async ({ task }) => {
  try {
    if (task.result?.state === "fail") {
      server.debug();
    }

    await Promise.all(clients.splice(0).map((client) => client.shutdown()));
  } finally {
    await server.reset();
  }
});

afterAll(async () => {
  await server.close();
});

async function connect(hostId: string): Promise<AhpClient> {
  const { url } = await server.listen();
  const endpoint = new URL(`/hosts/${hostId}/ahp`, url);
  endpoint.protocol = "ws:";
  const transport = await WebSocketTransport.connect(endpoint);
  const client = new AhpClient(transport);
  clients.push(client);
  client.connect();

  const initialized = await client.initialize({
    clientId: crypto.randomUUID(),
    protocolVersions: [PROTOCOL_VERSION],
  });

  expect(initialized.protocolVersion).toBe(PROTOCOL_VERSION);

  return client;
}

async function createSession(
  client: AhpClient,
  hostId: string,
): Promise<{
  channel: string;
  chat: string;
  name: string;
  stub: ReturnType<TestEnv["AGENT_SESSION"]["getByName"]>;
}> {
  const sessionId = crypto.randomUUID();
  const channel = `ahp-session:/${sessionId}`;
  await client.request("createSession", { channel, provider: "pi" });
  const { result } = await client.subscribe(channel);
  const state = SessionStateSchema.parse(result.snapshot?.state);
  const chat = state.defaultChat;

  if (chat === undefined) {
    throw new Error("Session did not create a default chat");
  }

  const env = await worker.getEnv();
  const name = `${hostId}/${sessionId}`;

  return { channel, chat, name, stub: env.AGENT_SESSION.getByName(name) };
}

function startTurn(client: AhpClient, chat: string, text: string): string {
  const turnId = crypto.randomUUID();
  client.dispatch(chat, {
    type: ActionType.ChatTurnStarted,
    turnId,
    startedAt: new Date().toISOString(),
    message: { text, origin: { kind: MessageKind.User } },
  });

  return turnId;
}

async function collectTurn(subscription: Subscription, turnId: string): Promise<ChatAction[]> {
  const actions: ChatAction[] = [];

  for await (const event of subscription) {
    if (event.type !== "action") {
      continue;
    }

    expect(event.params.rejectionReason).toBeUndefined();
    const action = ChatActionSchema.parse(event.params.action);

    if (!("turnId" in action) || action.turnId !== turnId) {
      continue;
    }

    actions.push(action);

    if (action.type === "chat/error") {
      throw new Error(action.part.error.message);
    }

    if (action.type === "chat/turnComplete") {
      return actions;
    }
  }

  throw new Error("Connection closed before the turn completed");
}

it("streams a Faux response through Pi and ACP to two WebSocket clients", async () => {
  const hostId = crypto.randomUUID();
  const first = await connect(hostId);
  const second = await connect(hostId);
  const session = await createSession(first, hostId);
  await session.stub.setResponses([fauxAssistantMessage("Hello from Faux.")]);
  const firstChat = await first.subscribe(session.chat);
  const secondChat = await second.subscribe(session.chat);
  const turnId = startTurn(first, session.chat, "Say hello.");

  const [firstActions, secondActions] = await Promise.all([
    collectTurn(firstChat.subscription, turnId),
    collectTurn(secondChat.subscription, turnId),
  ]);

  expect(firstActions).toEqual(secondActions);

  const text = firstActions
    .filter((action) => action.type === "chat/delta")
    .map((action) => action.content)
    .join("");

  expect(text).toBe("Hello from Faux.");
  const listed = await second.request("listSessions", { channel: "ahp-root://" });

  expect(listed.items.map((item) => item.resource)).toEqual([session.channel]);
});

it("executes a scripted write tool against the real workspace", async () => {
  const hostId = crypto.randomUUID();
  const client = await connect(hostId);
  const session = await createSession(client, hostId);

  const write = fauxToolCall("write", {
    path: "/workspace/hello.txt",
    content: "Written by Pi.",
  });

  await session.stub.setResponses([
    fauxAssistantMessage(write, { stopReason: "toolUse" }),
    fauxAssistantMessage("The file is ready."),
  ]);

  const { subscription } = await client.subscribe(session.chat);
  await collectTurn(subscription, startTurn(client, session.chat, "Write hello.txt."));

  expect(await session.stub.readFile("/workspace/hello.txt")).toBe("Written by Pi.");
});

it("retains history after a restart and continues through ACP session load", async () => {
  const hostId = crypto.randomUUID();
  const client = await connect(hostId);
  const session = await createSession(client, hostId);
  await session.stub.setResponses([fauxAssistantMessage("Before eviction.")]);
  const { subscription } = await client.subscribe(session.chat);
  const firstTurn = startTurn(client, session.chat, "First prompt.");
  await collectTurn(subscription, firstTurn);

  expect(await session.stub.modelCallCount()).toBe(1);
  await expect(session.stub.restart()).rejects.toBeInstanceOf(Error);
  await server.getWorker().evictDurableObject("AGENT_HOST", { name: hostId });
  const reconnected = await connect(hostId);
  const { result, subscription: resumed } = await reconnected.subscribe(session.chat);
  const before = ChatStateSchema.parse(result.snapshot?.state);
  expect(before.turns).toMatchObject([
    { id: firstTurn, state: "complete", responseParts: [{ content: "Before eviction." }] },
  ]);

  const env = await worker.getEnv();
  const restarted = env.AGENT_SESSION.getByName(session.name);
  expect(await restarted.modelCallCount()).toBe(0);
  await restarted.setResponses([fauxAssistantMessage("After eviction.")]);
  const secondTurn = startTurn(reconnected, session.chat, "Second prompt.");
  await collectTurn(resumed, secondTurn);
  const snapshot = await reconnected.subscribe(session.chat);
  const after = ChatStateSchema.parse(snapshot.result.snapshot?.state);
  expect(after.turns).toMatchObject([
    { id: firstTurn, responseParts: [{ content: "Before eviction." }] },
    { id: secondTurn, state: "complete", responseParts: [{ content: "After eviction." }] },
  ]);

  await reconnected.request("disposeSession", { channel: session.channel });
  const listed = await reconnected.request("listSessions", { channel: "ahp-root://" });
  expect(listed.items).toEqual([]);

  const storage = await worker.getDurableObjectStorage("AGENT_SESSION", {
    name: session.name,
  });

  const tables = await storage.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%'",
  );

  expect(tables).toEqual([]);
});
