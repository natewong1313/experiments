import {
  ChatStateSchema,
  InitializeResultSchema,
  RootStateSchema,
  SessionStateSchema,
  SnapshotSchema,
  type ChatState,
  type InitializeResult,
  type RootState,
  type SessionState,
} from "@experiments/protocol-schemas";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { AhpClient, RpcError } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import { expect } from "vitest";

const ROOT = "ahp-root://";
const VERSION = PROTOCOL_VERSION;
const SESSION = process.env.AHP_SESSION_URI;
const MUTATIONS = process.env.AHP_TEST_MUTATIONS === "1";

function sessionUri(): string {
  if (!SESSION) {

    throw new Error("Set AHP_SESSION_URI for session probes");

  }
  return SESSION;
}

function endpoint(): string {
  const url = process.env.AHP_URL;
  if (!url) {
    throw new Error("Set AHP_URL to the host's ws:// or wss:// endpoint");
  }
  return url;
}

async function withClient<T>(run: (client: AhpClient) => Promise<T>): Promise<T> {
  const transport = await WebSocketTransport.connect(endpoint());
  const client = new AhpClient(transport, { requestTimeoutMs: 10_000 });
  client.connect();
  try {
    return await run(client);
  } finally {
    await client.shutdown();
  }
}

async function initialized(client: AhpClient, subscriptions: string[] = []): Promise<InitializeResult> {
  const result = await client.initialize({
    clientId: `conformance-${crypto.randomUUID()}`,
    protocolVersions: [VERSION],
    initialSubscriptions: subscriptions,
  });
  return InitializeResultSchema.parse(result);
}

type StateParser<T> = { parse(value: unknown): T };

function expectState<T>(snapshot: unknown, resource: string, parseState: StateParser<T>): T {
  const parsed = SnapshotSchema.parse(snapshot);
  expect(parsed.resource).toBe(resource);
  return parseState.parse(parsed.state);
}

function expectRootState(snapshot: unknown): RootState {
  return expectState(snapshot, ROOT, RootStateSchema);
}

function expectSessionState(snapshot: unknown, resource: string): SessionState {
  return expectState(snapshot, resource, SessionStateSchema);
}

function expectChatState(snapshot: unknown, resource: string): ChatState {
  return expectState(snapshot, resource, ChatStateSchema);
}

async function expectRpcError(run: () => Promise<unknown>, code: number): Promise<RpcError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(RpcError);
    if (error instanceof RpcError) {
      expect(error.code).toBe(code);
      return error;
    }
    throw error;
  }
  throw new Error(`Expected AHP error ${code}`);
}

async function sessionSnapshot(client: AhpClient): Promise<SessionState> {
  if (!SESSION) {
    throw new Error("Set AHP_SESSION_URI for session probes");
  }
  const subscribed = await client.subscribe(SESSION);
  const { snapshot } = subscribed.result;
  return expectSessionState(snapshot, SESSION);
}

type ChatSnapshot = { uri: string; session: SessionState; state: ChatState };

async function chatSnapshot(client: AhpClient): Promise<ChatSnapshot> {
  const session = await sessionSnapshot(client);
  const [chat] = session.chats;
  if (!chat) {
    throw new Error("Fixture session has no default chat");
  }
  const { resource } = chat;
  const subscribed = await client.subscribe(resource);
  const { snapshot } = subscribed.result;
  return { uri: resource, session, state: expectChatState(snapshot, resource) };
}

export {
  chatSnapshot,
  endpoint,
  expectChatState,
  expectRootState,
  expectRpcError,
  expectSessionState,
  expectState,
  initialized,
  MUTATIONS,
  ROOT,
  SESSION,
  sessionUri,
  sessionSnapshot,
  VERSION,
  withClient,
};
