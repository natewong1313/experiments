import {
  ChatStateSchema,
  InitializeResultSchema,
  RootStateSchema,
  SessionStateSchema,
  SnapshotSchema,
  type ChannelState,
  type ChatState,
  type InitializeResult,
  type RootState,
  type SessionState,
  type Snapshot,
} from "@experiments/protocol-schemas";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { AhpClient, RpcError } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import { expect, test as baseTest } from "vitest";
import { withCleanup } from "./cleanup";

export const ROOT = "ahp-root://";
export const VERSION = PROTOCOL_VERSION;
export const SESSION = process.env.AHP_SESSION_URI;
export const MUTATIONS = process.env.AHP_TEST_MUTATIONS === "1";

export function sessionUri(): string {
  if (!SESSION) {
    throw new Error("Set AHP_SESSION_URI for session probes");
  }

  return SESSION;
}

export const test = baseTest.extend<{ client: AhpClient }>({
  client: async ({ task: _task }, use) => {
    await withClient(use);
  },
});

export function endpoint(): string {
  const url = process.env.AHP_URL;

  if (!url) {
    throw new Error("Set AHP_URL to the host's ws:// or wss:// endpoint");
  }

  return url;
}

export async function withClient<T>(
  run: (client: AhpClient) => Promise<T>,
  url: string = endpoint(),
): Promise<T> {
  const transport = await WebSocketTransport.connect(url);
  const client = new AhpClient(transport, { requestTimeoutMs: 10_000 });

  return await withCleanup(
    async () => {
      client.connect();

      return await run(client);
    },
    async () => {
      await client.shutdown();
    },
  );
}

export async function initialized(
  client: AhpClient,
  subscriptions: string[] = [],
): Promise<InitializeResult> {
  const result = await client.initialize({
    clientId: `conformance-${crypto.randomUUID()}`,
    protocolVersions: [VERSION],
    initialSubscriptions: subscriptions,
  });

  return InitializeResultSchema.parse(result);
}

type StateParser<T> = { parse(value: ChannelState): T };

export function expectState<T>(
  snapshot: Snapshot | undefined,
  resource: string,
  parseState: StateParser<T>,
): T {
  const parsed = SnapshotSchema.parse(snapshot);
  expect(parsed.resource).toBe(resource);

  return parseState.parse(parsed.state);
}

export function expectRootState(snapshot: Snapshot | undefined): RootState {
  return expectState(snapshot, ROOT, RootStateSchema);
}

export function expectSessionState(snapshot: Snapshot | undefined, resource: string): SessionState {
  return expectState(snapshot, resource, SessionStateSchema);
}

export function expectChatState(snapshot: Snapshot | undefined, resource: string): ChatState {
  return expectState(snapshot, resource, ChatStateSchema);
}

export async function expectRpcError<T>(run: () => Promise<T>, code: number): Promise<RpcError> {
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

export async function sessionSnapshot(
  client: AhpClient,
  resource: string = sessionUri(),
): Promise<SessionState> {
  const subscribed = await client.subscribe(resource);
  const { snapshot } = subscribed.result;

  return expectSessionState(snapshot, resource);
}

type ChatSnapshot = { uri: string; session: SessionState; state: ChatState };

export async function chatSnapshot(
  client: AhpClient,
  resource: string = sessionUri(),
): Promise<ChatSnapshot> {
  const session = await sessionSnapshot(client, resource);
  const [firstChat] = session.chats;
  const { defaultChat } = session;

  const chat = defaultChat
    ? session.chats.find((item) => item.resource === defaultChat)
    : firstChat;

  if (defaultChat && !chat) {
    throw new Error(
      `Fixture session default chat ${defaultChat} is absent from the session catalogue`,
    );
  }

  if (!chat) {
    throw new Error("Fixture session has no listed chats");
  }

  const { resource: chatResource } = chat;
  const subscribed = await client.subscribe(chatResource);
  const { snapshot } = subscribed.result;

  return {
    uri: chatResource,
    session,
    state: expectChatState(snapshot, chatResource),
  };
}
