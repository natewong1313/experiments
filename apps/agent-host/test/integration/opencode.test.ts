import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createTestHarness } from "wrangler";
import { AhpClient } from "@microsoft/agent-host-protocol/client";
import type { Subscription } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import { ActionType, MessageKind, PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import {
  ChatActionSchema,
  SessionStateSchema,
  RootStateSchema,
  type ChatAction,
} from "@experiments/protocol-schemas/ahp";
import type { AgentHostSession } from "./opencode-worker";
import type { DurableObjectNamespace as WorkerNamespace } from "@cloudflare/workers-types";

type TestEnv = {
  AGENT_SESSION: WorkerNamespace<AgentHostSession>;
};

const server = createTestHarness({
  workers: [{ configPath: "./test/integration/opencode.wrangler.jsonc" }],
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
  provider = "opencode",
): Promise<{
  channel: string;
  chat: string;
  name: string;
  stub: ReturnType<TestEnv["AGENT_SESSION"]["getByName"]>;
}> {
  const sessionId = crypto.randomUUID();
  const channel = `ahp-session:/${sessionId}`;
  await client.request("createSession", { channel, provider });
  const { result } = await client.subscribe(channel);
  const state = SessionStateSchema.parse(result.snapshot?.state);
  const chat = state.defaultChat;

  if (chat === undefined) {
    throw new Error("Session did not create a default chat");
  }

  const env = await worker.getEnv();
  const name = `${hostId}/${sessionId}`;

  return {
    channel,
    chat,
    name,
    stub: env.AGENT_SESSION.getByName(name),
  };
}

/** Starts a turn with `text`. The message selects `model` if it is given. */
function startTurn(client: AhpClient, chat: string, text: string, model?: string): string {
  const turnId = crypto.randomUUID();
  client.dispatch(chat, {
    type: ActionType.ChatTurnStarted,
    turnId,
    startedAt: new Date().toISOString(),
    message: {
      text,
      origin: { kind: MessageKind.User },
      ...(model !== undefined && { model: { id: model } }),
    },
  });

  return turnId;
}

/** Returns text from a markdown part or delta action. Other actions return an empty string. */
function markdownOf(action: ChatAction): string {
  if (action.type === "chat/delta") {
    return action.content;
  }

  return action.type === "chat/responsePart" && action.part.kind === "markdown"
    ? action.part.content
    : "";
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

it("runs OpenCode through the multi-agent AHP host and writes to its durable workspace", async () => {
  const hostId = crypto.randomUUID();
  const client = await connect(hostId);
  const session = await createSession(client, hostId);
  const { subscription } = await client.subscribe(session.chat);
  const actions = await collectTurn(subscription, startTurn(client, session.chat, "Write a file."));

  expect(actions.map((action) => markdownOf(action)).join("")).toBe("The file is ready.");
  expect(await session.stub.readFile()).toBe("Written by OpenCode.");
});

it("reattaches to an OpenCode operation without another model call", async () => {
  const env = await worker.getEnv();
  const result = await env.AGENT_SESSION.getByName(crypto.randomUUID()).replayOperation();
  expect(result.stopReason).toBe("end_turn");
  expect(result.repeatedStopReason).toBe(result.stopReason);
  expect(result.tokens).toBeDefined();
  expect(result.repeatedTokens).toBe(result.tokens);
  expect(result.callsAfterReplay).toBe(result.calls);
  expect(result.tools).toEqual(["in_progress", "completed"]);
  expect(result.text).toBe("The file is ready.");
});

it("advertises both providers and runs one session of each on the same host", async () => {
  const hostId = crypto.randomUUID();
  const client = await connect(hostId);
  const root = await client.subscribe("ahp-root://");
  const state = RootStateSchema.parse(root.result.snapshot?.state);
  expect(state.agents.map((agent) => agent.provider)).toEqual(["pi", "opencode"]);
  const pi = await createSession(client, hostId, "pi");
  const opencode = await createSession(client, hostId, "opencode");
  const piChat = await client.subscribe(pi.chat);
  const opencodeChat = await client.subscribe(opencode.chat);
  const piTurn = startTurn(client, pi.chat, "Write with Pi.");
  const opencodeTurn = startTurn(client, opencode.chat, "Write with OpenCode.");

  const results = await Promise.all([
    collectTurn(piChat.subscription, piTurn),
    collectTurn(opencodeChat.subscription, opencodeTurn),
  ]);

  expect(results.map((actions) => actions.map((action) => markdownOf(action)).join(""))).toEqual([
    "The file is ready.",
    "The file is ready.",
  ]);
  expect(await pi.stub.answeredBy()).toEqual({ pi: true, opencode: false });
  expect(await opencode.stub.answeredBy()).toEqual({ pi: false, opencode: true });
  const listed = await client.request("listSessions", { channel: "ahp-root://" });
  expect(listed.items.map((item) => item.provider).toSorted()).toEqual(["opencode", "pi"]);
  await expect(
    client.request("createSession", { channel: pi.channel, provider: "opencode" }),
  ).rejects.toThrow("Session already exists");
});

it("restores the stored OpenCode provider after a session object restart", async () => {
  const hostId = crypto.randomUUID();
  const client = await connect(hostId);
  const session = await createSession(client, hostId);
  const chat = await client.subscribe(session.chat);
  await collectTurn(chat.subscription, startTurn(client, session.chat, "Write a file."));
  await expect(session.stub.restart()).rejects.toBeInstanceOf(Error);

  const reconnected = await connect(hostId);
  const resumed = await reconnected.subscribe(session.chat);

  const actions = await collectTurn(
    resumed.subscription,
    startTurn(reconnected, session.chat, "Continue."),
  );

  expect(actions.map((action) => markdownOf(action)).join("")).toBe("The file is ready.");
  const env = await worker.getEnv();
  const restarted = env.AGENT_SESSION.getByName(session.name);

  expect(await restarted.answeredBy()).toEqual({ pi: false, opencode: true });
});

it("defaults to Pi and rejects unknown providers", async () => {
  const client = await connect(crypto.randomUUID());
  const channel = `ahp-session:/${crypto.randomUUID()}`;
  await client.request("createSession", { channel });
  const { result } = await client.subscribe(channel);
  expect(SessionStateSchema.parse(result.snapshot?.state).provider).toBe("pi");
  const unknownChannel = `ahp-session:/${crypto.randomUUID()}`;

  await expect(
    client.request("createSession", {
      channel: unknownChannel,
      provider: "unknown",
    }),
  ).rejects.toThrow("Agent provider does not exist");
});
