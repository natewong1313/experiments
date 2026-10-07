import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import {
  agent,
  methods,
  type AgentConnection,
  PROTOCOL_VERSION,
  type PromptResponse,
} from "@agentclientprotocol/sdk";
import {
  ChatStateSchema,
  SubscribeResultSchema,
  type Message,
} from "@experiments/protocol-schemas/ahp";
import { expect, it, vi } from "vitest";
import { AgentConnections } from "../src/agent/acp";
import { websocketStream } from "@experiments/agent-host/helpers";
import type { ContentBlock } from "@experiments/protocol-schemas/acp";
import { createHostState, createSession } from "./config";
import { connectPeer, type Peer } from "./peer";
import { connectAcp } from "./worker";
import { withAcpAgent } from "./acp-host";

const SESSION = "ahp-session:/host-test";

const SWITCHING_PROTOCOLS = 101;

const CREATION_LIMIT = 2;

type DispatchTurnParams = {
  peer: Peer;
  chat: string;
  message: Message;
  turnId?: string;
  clientSeq?: number;
};

type ChatSnapshotParams = { peer: Peer; chat: string };

function dispatchTurn({
  peer,
  chat,
  message,
  turnId = "mapped-turn",
  clientSeq = 1,
}: DispatchTurnParams): void {
  peer.notify("dispatchAction", {
    channel: chat,
    clientSeq,
    action: {
      type: "chat/turnStarted",
      turnId,
      startedAt: "2026-10-01T00:00:00.000Z",
      message,
    },
  });
}

async function chatSnapshot({
  peer,
  chat,
}: ChatSnapshotParams): Promise<ReturnType<typeof ChatStateSchema.parse>> {
  const result = SubscribeResultSchema.parse(await peer.request("subscribe", { channel: chat }));

  return ChatStateSchema.parse(result.snapshot?.state);
}

function storedUri(state: ReturnType<typeof ChatStateSchema.parse>): string {
  for (const part of state.turns.flatMap((turn) => turn.responseParts)) {
    if (part.kind === "contentRef") {
      return part.uri;
    }

    if (part.kind === "toolCall" && "content" in part.toolCall) {
      const edit = part.toolCall.content?.find((item) => item.type === "fileEdit");

      if (edit?.type === "fileEdit" && edit.after) {
        return edit.after.content.uri;
      }
    }
  }

  throw new Error("Expected stored content reference");
}

it("publishes ACP text, reasoning, and tool updates through the host", async () => {
  await withAcpAgent({
    prompt: async (connection, request) => {
      expect(request.prompt).toEqual([{ type: "text", text: "Read the file" }]);
      const { sessionId } = request;

      const firstMessage = {
        type: "text",
        text: "Hel",
        futureField: true,
      } satisfies ContentBlock;

      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Think" },
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: " carefully" },
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: firstMessage,
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "lo" },
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "read-file",
          title: "Read file",
          kind: "read",
          rawInput: { path: "file.txt" },
          status: "in_progress",
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "read-file",
          status: "completed",
          content: [
            {
              type: "content",
              content: { type: "text", text: "File contents" },
            },
            { type: "diff", path: "file.txt", newText: "Ignored diff" },
          ],
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: " Done" },
        },
      });

      return { stopReason: "end_turn" };
    },
    run: async (peer, chat) => {
      dispatchTurn({
        peer,
        chat,
        message: { text: "Read the file", origin: { kind: "user" } },
      });
      await vi.waitFor(() => {
        expect(peer.actions.some(({ action }) => action.type === "chat/turnComplete")).toBe(true);
      });
      const state = await chatSnapshot({ peer, chat });
      expect(state.activeTurn).toBeUndefined();
      expect(storedUri(state).startsWith("ahp-content:/")).toBe(true);
      expect(state.turns).toMatchObject([
        {
          id: "mapped-turn",
          state: "complete",
          responseParts: [
            {
              kind: "reasoning",
              id: "mapped-turn/reasoning/0",
              content: "Think carefully",
            },
            {
              kind: "markdown",
              id: "mapped-turn/markdown/1",
              content: "Hello",
            },
            {
              kind: "toolCall",
              toolCall: {
                toolCallId: "read-file",
                status: "completed",
                toolInput: '{"path":"file.txt"}',
                success: true,
                content: [
                  { type: "text", text: "File contents" },
                  {
                    type: "fileEdit",
                    after: {
                      uri: "file:///file.txt",
                      content: { uri: storedUri(state) },
                    },
                  },
                ],
              },
            },
            {
              kind: "markdown",
              id: "mapped-turn/markdown/3",
              content: " Done",
            },
          ],
        },
      ]);
      expect(
        peer.actions.map(({ action }) => action).filter((action) => action.type === "chat/delta"),
      ).toEqual([
        {
          type: "chat/delta",
          turnId: "mapped-turn",
          partId: "mapped-turn/markdown/1",
          content: "Hel",
        },
        {
          type: "chat/delta",
          turnId: "mapped-turn",
          partId: "mapped-turn/markdown/1",
          content: "lo",
        },
        {
          type: "chat/delta",
          turnId: "mapped-turn",
          partId: "mapped-turn/markdown/3",
          content: " Done",
        },
      ]);
    },
  });
});

it.each([
  {
    stopReason: "max_tokens",
    message: "The agent stopped before finishing: max_tokens",
  },
  {
    stopReason: "max_turn_requests",
    message: "The agent stopped before finishing: max_turn_requests",
  },
  {
    stopReason: "refusal",
    message: "The agent stopped before finishing: refusal",
  },
] satisfies { stopReason: PromptResponse["stopReason"]; message: string }[])(
  "publishes an agent error when a prompt stops with $stopReason",
  async ({ stopReason, message }) => {
    await withAcpAgent({
      prompt: async () => ({ stopReason }),
      run: async (peer, chat) => {
        dispatchTurn({
          peer,
          chat,
          message: { text: "Hello", origin: { kind: "user" } },
        });
        await vi.waitFor(() => {
          expect(peer.actions.map(({ action }) => action)).toContainEqual(
            expect.objectContaining({
              type: "chat/error",
              turnId: "mapped-turn",
              part: {
                kind: "error",
                error: { errorType: "agent", message },
                resumable: false,
              },
            }),
          );
        });
        const state = await chatSnapshot({ peer, chat });
        expect(state.activeTurn).toBeUndefined();
        expect(state.turns).toMatchObject([{ id: "mapped-turn", state: "error" }]);
      },
    });
  },
);

it("declines ACP permission requests and publishes agent cancellation", async () => {
  await withAcpAgent({
    prompt: async (connection, request) => {
      const permission = await connection.client.request(methods.client.session.requestPermission, {
        sessionId: request.sessionId,
        toolCall: { toolCallId: "read-file", title: "Read file", kind: "read" },
        options: [{ optionId: "allow-read", name: "Allow reading", kind: "allow_once" }],
      });

      expect(permission.outcome).toEqual({ outcome: "cancelled" });

      return { stopReason: "cancelled" };
    },
    run: async (peer, chat) => {
      dispatchTurn({
        peer,
        chat,
        message: { text: "Hello", origin: { kind: "user" } },
      });
      await vi.waitFor(() => {
        expect(peer.actions.some(({ action }) => action.type === "chat/turnCancelled")).toBe(true);
      });
      const state = await chatSnapshot({ peer, chat });
      expect(state.turns).toMatchObject([{ id: "mapped-turn", state: "cancelled" }]);
    },
  });
});

it("sends client cancellation to the ACP agent", async () => {
  const response = Promise.withResolvers<PromptResponse>();
  let prompted = false;
  let cancelled = false;

  try {
    await withAcpAgent({
      prompt: async () => {
        prompted = true;

        return await response.promise;
      },
      cancel: async (): Promise<void> => {
        response.resolve({ stopReason: "cancelled" });
        cancelled = true;
      },
      run: async (peer, chat) => {
        dispatchTurn({
          peer,
          chat,
          message: { text: "Hello", origin: { kind: "user" } },
        });
        await vi.waitFor(() => {
          expect(prompted).toBe(true);
        });
        peer.notify("dispatchAction", {
          channel: chat,
          clientSeq: CREATION_LIMIT,
          action: {
            type: "chat/turnCancelled",
            turnId: "mapped-turn",
            duration: 0,
          },
        });
        await vi.waitFor(() => {
          const acknowledgement = peer.actions.find(
            ({ origin }) => origin?.clientSeq === CREATION_LIMIT,
          );

          expect(acknowledgement).toMatchObject({
            action: { type: "chat/turnCancelled", turnId: "mapped-turn" },
          });
          expect(acknowledgement?.rejectionReason).toBeUndefined();
          expect(cancelled).toBe(true);
        });
        const state = await chatSnapshot({ peer, chat });
        expect(state.turns).toMatchObject([{ id: "mapped-turn", state: "cancelled" }]);
      },
    });
  } finally {
    response.resolve({ stopReason: "cancelled" });
  }
});

it("rejects attachments through the prompt mapper before invoking ACP", async () => {
  const prompt = vi.fn<() => Promise<PromptResponse>>(async (): Promise<PromptResponse> => ({
    stopReason: "end_turn",
  }));

  await withAcpAgent({
    prompt,
    run: async (peer, chat) => {
      dispatchTurn({
        peer,
        chat,
        message: {
          text: "Describe this",
          origin: { kind: "user" },
          attachments: [{ type: "simple", label: "Context" }],
        },
      });
      await vi.waitFor(() => {
        expect(peer.actions).toContainEqual(
          expect.objectContaining({
            rejectionReason: "This host supports text prompts only",
          }),
        );
      });
      const state = await chatSnapshot({ peer, chat });
      expect(state.turns).toEqual([]);
      expect(prompt).not.toHaveBeenCalled();
    },
  });
});

it("preserves plans and images while ignoring unrelated ACP sessions", async () => {
  await withAcpAgent({
    prompt: async (connection, request) => {
      await connection.client.notify(methods.client.session.update, {
        sessionId: request.sessionId,
        update: { sessionUpdate: "plan", entries: [] },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId: request.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "image", data: "AQ==", mimeType: "image/png" },
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId: "another-conversation",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Wrong session" },
        },
      });

      return { stopReason: "end_turn" };
    },
    run: async (peer, chat) => {
      dispatchTurn({
        peer,
        chat,
        message: { text: "Hello", origin: { kind: "user" } },
      });
      await vi.waitFor(() => {
        expect(peer.actions.some(({ action }) => action.type === "chat/turnComplete")).toBe(true);
      });
      const state = await chatSnapshot({ peer, chat });
      expect(state.turns).toMatchObject([
        {
          state: "complete",
          responseParts: [
            { kind: "systemNotification", _meta: { acp: { update: { sessionUpdate: "plan" } } } },
            { kind: "contentRef", uri: storedUri(state) },
          ],
        },
      ]);
    },
  });
});

it("loads the bound ACP session without publishing its historical updates", async () => {
  await withAcpAgent({
    prompt: async (connection, request) => {
      await connection.client.notify(methods.client.session.update, {
        sessionId: request.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Current reply" },
        },
      });

      return { stopReason: "end_turn" };
    },
    run: async (peer, chat, disconnect) => {
      dispatchTurn({
        peer,
        chat,
        message: { text: "First", origin: { kind: "user" } },
      });
      await vi.waitFor(() => {
        expect(peer.actions.some(({ action }) => action.type === "chat/turnComplete")).toBe(true);
      });
      await disconnect();
      dispatchTurn({
        peer,
        chat,
        message: { text: "Second", origin: { kind: "user" } },
        turnId: "next-turn",
        clientSeq: CREATION_LIMIT,
      });
      await vi.waitFor(() => {
        expect(
          peer.actions.some(
            ({ action }) => action.type === "chat/turnComplete" && action.turnId === "next-turn",
          ),
        ).toBe(true);
      });
      const state = await chatSnapshot({ peer, chat });
      expect(state.turns).toMatchObject([
        {
          id: "mapped-turn",
          responseParts: [{ kind: "markdown", content: "Current reply" }],
        },
        {
          id: "next-turn",
          responseParts: [{ kind: "markdown", content: "Current reply" }],
        },
      ]);
    },
  });
});

it("acknowledges a non-ISO timestamp rejection without invoking the agent", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());

  const chat = await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = createHostState(state.storage);
    createSession(store, SESSION, "timestamp-generation");
    store.mutations.applyAction(SESSION, { type: "session/ready" });

    return store.queries.requireWithActiveOutput(SESSION).chatUri;
  });

  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const peer = await connectPeer(stub);

  try {
    await peer.request("subscribe", { channel: chat });

    const params = {
      channel: chat,
      clientSeq: 1,
      action: {
        type: "chat/turnStarted",
        turnId: "turn",
        startedAt: "October 1, 2026",
        message: { text: "Hello", origin: { kind: "user" } },
      },
    };

    peer.notify("dispatchAction", params);
    await vi.waitFor(() => {
      expect(peer.actions).toHaveLength(1);
    });
    expect(peer.actions[0]?.rejectionReason).toBe("Turn requires a valid start time");
    peer.notify("dispatchAction", params);
    await vi.waitFor(() => {
      expect(peer.actions).toHaveLength(CREATION_LIMIT);
    });
    expect(peer.actions[1]).toEqual(peer.actions[0]);
    const snapshot = await peer.request("subscribe", { channel: chat });
    expect(snapshot).toMatchObject({ snapshot: { state: { turns: [] } } });
    await runInDurableObject(stub, (instance, state) => {
      expect(instance).toBeDefined();
      const store = createHostState(state.storage);
      const stateSnapshot = ChatStateSchema.parse(store.queries.readSnapshot(chat).state);
      expect(stateSnapshot.activeTurn).toBeUndefined();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    peer.close();
    fetchSpy.mockRestore();
  }
});

it("releasing an old generation keeps a replacement ACP connection usable", async () => {
  const sockets: WebSocket[] = [];
  const servers: AgentConnection[] = [];

  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (): Promise<Response> => {
    const { 0: client, 1: server } = new WebSocketPair();
    const sessionId = crypto.randomUUID();

    const connection = agent()
      .onRequest(methods.agent.initialize, () => ({
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
      }))
      .onRequest(methods.agent.session.new, () => ({ sessionId }))
      .onRequest(methods.agent.session.load, () => ({}))
      .onRequest(methods.agent.session.prompt, () => ({ stopReason: "end_turn" }))
      .connect(websocketStream(server));

    sockets.push(server);
    servers.push(connection);

    return new Response(null, {
      status: SWITCHING_PROTOCOLS,
      webSocket: client,
    });
  });

  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());

  try {
    await runInDurableObject(stub, async (instance, state) => {
      expect(instance).toBeDefined();
      const store = createHostState(state.storage);
      createSession(store, SESSION, "old-generation");
      const original = store.queries.requireWithActiveOutput(SESSION);

      const agents = new AgentConnections({
        connect: connectAcp,
        updates: (): void => {},
      });

      try {
        const old = await agents.get(original);
        store.mutations.deleteSession(SESSION);
        createSession(store, SESSION, "replacement-generation");
        const replacement = store.queries.requireWithActiveOutput(SESSION);
        const current = await agents.get(replacement);
        expect(current.sessionId).not.toBe(old.sessionId);
        await agents.release(original);
        expect(current.closed).toBe(false);
        const result = await current.prompt({ text: "Still usable" });
        expect(result.stopReason).toBe("end_turn");
        await agents.release(replacement);
      } finally {
        for (const socket of sockets) {
          socket.close();
        }

        await Promise.all(servers.map((server) => server.closed));
      }
    });
    expect(fetchSpy).toHaveBeenCalledTimes(CREATION_LIMIT);
  } finally {
    fetchSpy.mockRestore();
  }
});

it("ends an oversized streamed turn with a durable error and releases the agent", async () => {
  const chunkBytes = 500_000;
  const chunkCount = 5;
  await withAcpAgent({
    prompt: async (connection, request) => {
      await Promise.all(
        Array.from({ length: chunkCount }, () =>
          connection.client.notify(methods.client.session.update, {
            sessionId: request.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "x".repeat(chunkBytes) },
            },
          }),
        ),
      );

      return { stopReason: "end_turn" };
    },
    run: async (peer, chat) => {
      peer.notify("dispatchAction", {
        channel: chat,
        clientSeq: 1,
        action: {
          type: "chat/turnStarted",
          turnId: "oversized",
          startedAt: new Date().toISOString(),
          message: { text: "Generate output", origin: { kind: "user" } },
        },
      });
      await vi.waitFor(() => {
        expect(
          peer.actions.some(
            ({ action }) =>
              action.type === "chat/error" && action.part.error.errorType === "resource-limit",
          ),
        ).toBe(true);
      });

      const response = SubscribeResultSchema.parse(
        await peer.request("subscribe", { channel: chat }),
      );

      const state = ChatStateSchema.parse(response.snapshot?.state);
      expect(state.activeTurn).toBeUndefined();
      expect(state.turns).toHaveLength(1);
      expect(state.turns[0]?.state).toBe("error");
      expect(peer.actions.some(({ action }) => action.type === "chat/turnComplete")).toBe(false);
    },
  });
});
