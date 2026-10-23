import { env } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import * as z from "zod";
import {
  ChatStateSchema,
  type ChatState,
  SessionStateSchema,
  ListSessionsResultSchema,
  SessionSummarySchema,
  SubscribeResultSchema,
} from "@experiments/protocol-schemas/ahp";
import { connectPeer, createSession as createPeerSession, openPeer } from "./peer";
import { finishHeldPrompt } from "./session";
import type { AgentSession } from "./session";
import type { CreatedSession, Peer } from "./peer";
import { CloseCode } from "../src/router/websockets";
import { changeSession } from "./storage";
import {
  ActionType as AHPActionType,
  MessageKind as AHPMessageKind,
  ResponsePartKind as AHPResponsePartKind,
  PROTOCOL_VERSION as AHP_PROTOCOL_VERSION,
} from "@microsoft/agent-host-protocol";
import { sessionDOName } from "../src/shared/lookups";

const ChangesSchema = z.record(z.string(), z.json());
const SummaryChangedSchema = z.object({ changes: ChangesSchema });
const SessionAddedSchema = z.object({ summary: SessionSummarySchema });

/** Creates a session and subscribes the peer to its session channel and its chat. */
async function createSubscribedSession(peer: Peer): Promise<CreatedSession> {
  const created = await createPeerSession(peer);
  await peer.request("subscribe", { channel: created.chat });

  return created;
}

/** Starts a turn with `text`. The message selects `model` if it is given. */
function start(peer: Peer, chat: string, text: string, model?: string): string {
  const turnId = crypto.randomUUID();
  peer.notify("dispatchAction", {
    channel: chat,
    clientSeq: 1,
    action: {
      type: "chat/turnStarted",
      turnId,
      startedAt: new Date().toISOString(),
      message: {
        text,
        origin: { kind: "user" },
        ...(model !== undefined && { model: { id: model } }),
      },
    },
  });

  return turnId;
}

async function chatState(peer: Peer, chat: string): Promise<ChatState> {
  const result = SubscribeResultSchema.parse(await peer.request("subscribe", { channel: chat }));

  return ChatStateSchema.parse(result.snapshot?.state);
}

it("refuses a session that was not addressed by name", async () => {
  const stub = env.CONVERSATIONS.get(env.CONVERSATIONS.newUniqueId());
  const channel = `ahp-session:/${crypto.randomUUID()}`;

  let failure: Error | undefined;

  try {
    await stub.create({ channel, provider: "test" });
  } catch (error) {
    failure = error instanceof Error ? error : undefined;
  }

  expect(failure).toMatchObject({ message: "AgentHostSession must be addressed by name" });
});

it("rejects actions on a session channel and reports only changed summary fields", async () => {
  const peer = await connectPeer(crypto.randomUUID());

  try {
    const session = await createSubscribedSession(peer);
    await peer.request("subscribe", { channel: "ahp-root://" });

    peer.notify("dispatchAction", {
      channel: session.channel,
      clientSeq: 1,
      action: {
        type: "chat/turnStarted",
        turnId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        message: { text: "hello", origin: { kind: "user" } },
      },
    });

    await vi.waitFor(() => {
      expect(peer.actions).toContainEqual(
        expect.objectContaining({
          channel: session.channel,
          rejectionReason: "Actions must target a chat channel",
        }),
      );
    });

    start(peer, session.chat, "hello");
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
    });

    const changes = peer.notifications
      .filter((item) => item.method === "root/sessionSummaryChanged")
      .map((item) => SummaryChangedSchema.parse(item.params).changes);

    expect(changes.length).toBeGreaterThan(0);

    for (const changed of changes) {
      expect(Object.keys(changed).length).toBeGreaterThan(0);
      expect(changed).not.toHaveProperty("resource");
      expect(changed).not.toHaveProperty("createdAt");
      expect(changed).not.toHaveProperty("workingDirectories");
    }
  } finally {
    peer.close();
  }
});

it("streams the same turn to two clients and retains it after reconstruction", async () => {
  const hostId = crypto.randomUUID();
  const first = await connectPeer(hostId);
  const second = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(first);
    await second.request("subscribe", { channel: session.chat });
    const turnId = start(first, session.chat, "hello");
    await vi.waitFor(() => {
      expect(first.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
      expect(second.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
    });
    const echoed = first.actions.find((item) => item.action.type === "chat/turnStarted");
    expect(echoed?.origin).toMatchObject({ clientSeq: 1 });
    // Each connection has its own `serverSeq`.
    // Thus the test compares the actions without their sequences.
    const firstChat = first.actions.filter((item) => item.channel === session.chat);
    const secondChat = second.actions.filter((item) => item.channel === session.chat);
    expect(firstChat.map(({ serverSeq: _seq, ...item }) => item)).toEqual(
      secondChat.map(({ serverSeq: _seq, ...item }) => item),
    );

    for (const peer of [first, second]) {
      const sequences = peer.actions.map((item) => item.serverSeq);
      expect(sequences).toEqual([...sequences].toSorted((a, b) => a - b));
      expect(new Set(sequences).size).toBe(sequences.length);
    }

    const before = await chatState(first, session.chat);
    expect(before.turns[0]).toMatchObject({
      id: turnId,
      state: "complete",
      responseParts: [{ kind: "markdown", content: "hello" }],
    });
    const sessionStub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.sessionId));
    await evictDurableObject(sessionStub);
    await evictDurableObject(env.COORDINATORS.getByName(hostId));
    expect(await chatState(first, session.chat)).toEqual(before);

    const catalogue = ListSessionsResultSchema.parse(
      await first.request("listSessions", { channel: "ahp-root://" }),
    );

    expect(catalogue.items.map((item) => item.resource)).toEqual([session.channel]);
  } finally {
    first.close();
    second.close();
  }
});

it("keeps every text update when the agent streams several at once", async () => {
  const peer = await connectPeer(crypto.randomUUID());

  try {
    const session = await createSubscribedSession(peer);
    const turnId = start(peer, session.chat, "stream");
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
    });
    const state = await chatState(peer, session.chat);
    expect(state.turns[0]).toMatchObject({
      id: turnId,
      state: "complete",
      responseParts: [{ kind: "markdown", content: "stream" }],
    });
  } finally {
    peer.close();
  }
});

it("runs another session while one is waiting and rejects a second active turn", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const first = await createSubscribedSession(peer);
    const second = await createSubscribedSession(peer);
    const held = start(peer, first.chat, "hold");
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/responsePart")).toBe(true);
    });
    start(peer, first.chat, "second");
    await vi.waitFor(() => {
      expect(
        peer.actions.some((item) => item.rejectionReason === "A turn is already running"),
      ).toBe(true);
    });
    const other = start(peer, second.chat, "independent");
    await vi.waitFor(() => {
      expect(
        peer.actions.some(
          (item) => item.action.type === "chat/turnComplete" && item.action.turnId === other,
        ),
      ).toBe(true);
    });
    const heldState = await chatState(peer, first.chat);
    expect(heldState.activeTurn?.id).toBe(held);
    peer.notify("dispatchAction", {
      channel: first.chat,
      clientSeq: 2,
      action: { type: "chat/turnCancelled", turnId: held, duration: 0 },
    });
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/turnCancelled")).toBe(true);
    });
    const cancelledState = await chatState(peer, first.chat);
    expect(cancelledState.turns[0]?.state).toBe("cancelled");
  } finally {
    peer.close();
  }
});

it("continues a prompt without clients and removes history on explicit disposal", async () => {
  const hostId = crypto.randomUUID();
  const first = await connectPeer(hostId);
  const session = await createSubscribedSession(first);
  start(first, session.chat, "hold");
  await vi.waitFor(() => {
    expect(first.actions.some((item) => item.action.type === "chat/responsePart")).toBe(true);
  });
  first.close();
  await env.CONVERSATIONS.getByName(sessionDOName(hostId, session.sessionId)).finishPrompt();
  const second = await connectPeer(hostId);

  try {
    await vi.waitFor(async () => {
      const state = await chatState(second, session.chat);
      expect(state.turns[0]?.state).toBe("complete");
    });
    await second.request("disposeSession", { channel: session.channel });

    const catalogue = ListSessionsResultSchema.parse(
      await second.request("listSessions", { channel: "ahp-root://" }),
    );

    expect(catalogue.items).toEqual([]);
    await expect(second.request("subscribe", { channel: session.chat })).rejects.toThrow(
      "Session does not exist",
    );
  } finally {
    second.close();
  }
});

/**
 * Runs the due alarms of the session until the chat has no active turn, and returns its state.
 * The test runtime runs alarms only on request.
 */
async function endedState(
  peer: Peer,
  stub: DurableObjectStub<AgentSession>,
  chat: string,
): Promise<ChatState> {
  let state: ChatState | undefined;

  await vi.waitFor(async () => {
    await runDurableObjectAlarm(stub);
    state = await chatState(peer, chat);
    expect(state.activeTurn).toBeUndefined();
  });

  if (!state) {
    throw new Error("Chat state is missing");
  }

  return state;
}

/**
 * Restarts the session object, as a crash or an eviction does, and returns a new stub. Eviction
 * in the test runtime waits for the background prompt run, so the test aborts the object
 * instead. The abort breaks the old stub.
 */
async function restart(name: string): Promise<DurableObjectStub<AgentSession>> {
  await runInDurableObject(env.CONVERSATIONS.getByName(name), (_instance, ctx) => {
    ctx.abort("Restart for the test");
  }).catch(() => null);

  return env.CONVERSATIONS.getByName(name);
}

/** Starts a held turn and waits until the session stores its first text. */
async function startHeldTurn(peer: Peer, chat: string): Promise<string> {
  const turnId = start(peer, chat, "hold");
  await vi.waitFor(() => {
    expect(peer.actions.some((item) => item.action.type === "chat/responsePart")).toBe(true);
  });

  return turnId;
}

it("continues an active turn after the session restarts", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const turnId = await startHeldTurn(peer, session.chat);

    const stub = await restart(sessionDOName(hostId, session.sessionId));
    // The restart schedules the turn at once. The new connection reattaches to the prompt.
    await vi.waitFor(async () => {
      await runDurableObjectAlarm(stub);
      expect(await stub.streamCounts()).toEqual({ total: 1, open: 1 });
    });
    await stub.finishPrompt(" and more");

    const state = await endedState(peer, stub, session.chat);
    expect(state.turns).toMatchObject([
      {
        id: turnId,
        state: "complete",
        responseParts: [{ kind: "markdown", id: turnId, content: "hold and more" }],
      },
    ]);
  } finally {
    peer.close();
  }
});

it("keeps the text that the agent sends while the session is evicted", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const name = sessionDOName(hostId, session.sessionId);
    const turnId = await startHeldTurn(peer, session.chat);

    const stub = await restart(name);
    finishHeldPrompt(name, " while away");

    const state = await endedState(peer, stub, session.chat);
    expect(state.turns).toMatchObject([
      {
        id: turnId,
        state: "complete",
        responseParts: [{ kind: "markdown", id: turnId, content: "hold while away" }],
      },
    ]);
  } finally {
    peer.close();
  }
});

it("cancels the prompt of a turn that a restart interrupted", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const turnId = await startHeldTurn(peer, session.chat);

    const stub = await restart(sessionDOName(hostId, session.sessionId));
    peer.notify("dispatchAction", {
      channel: session.chat,
      clientSeq: 2,
      action: { type: "chat/turnCancelled", turnId, duration: 0 },
    });

    const state = await endedState(peer, stub, session.chat);
    expect(state.turns).toMatchObject([{ id: turnId, state: "cancelled" }]);
    await vi.waitFor(async () => {
      expect(await stub.cancellationCount()).toBe(1);
    });
  } finally {
    peer.close();
  }
});

/** Waits until the peer receives an action of `type` for `turnId`. */
async function waitForAction(peer: Peer, type: string, turnId: string): Promise<void> {
  await vi.waitFor(() => {
    expect(
      peer.actions.some(
        (item) =>
          item.action.type === type && "turnId" in item.action && item.action.turnId === turnId,
      ),
    ).toBe(true);
  });
}

// The parts of a "tools" turn: its thinking, its completed read, and its answer.
function toolsParts(turnId: string): unknown[] {
  return [
    { kind: "reasoning", id: turnId, content: "Thinking" },
    {
      kind: "toolCall",
      toolCall: {
        status: "completed",
        toolCallId: "read-1",
        toolName: "read",
        success: true,
        toolInput: JSON.stringify({ path: "/a" }),
        content: [{ type: "text", text: "file text" }],
      },
    },
    { kind: "markdown", content: "Done" },
  ];
}

it("records the thinking, tool calls, text, and usage of a turn", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const turnId = start(peer, session.chat, "tools");
    await waitForAction(peer, "chat/turnComplete", turnId);

    const state = await chatState(peer, session.chat);
    expect(state.turns).toMatchObject([
      {
        id: turnId,
        state: "complete",
        responseParts: toolsParts(turnId),
        usage: { inputTokens: 2, outputTokens: 1 },
      },
    ]);
  } finally {
    peer.close();
  }
});

it("continues thinking and tool calls after the session restarts", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const name = sessionDOName(hostId, session.sessionId);
    const turnId = start(peer, session.chat, "hold tools");
    await waitForAction(peer, "chat/toolCallComplete", turnId);

    const stub = await restart(name);
    finishHeldPrompt(name, "Done");

    // The replay repeats the thinking and the tool call, which the turn keeps once.
    // Matching the whole array also checks that the turn has no other parts.
    const state = await endedState(peer, stub, session.chat);
    expect(state.turns).toMatchObject([
      { id: turnId, state: "complete", responseParts: toolsParts(turnId) },
    ]);
  } finally {
    peer.close();
  }
});

it("selects the model of a message for its turn and later turns", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.sessionId));
    expect(await stub.agentModel()).toBe("fast");

    const first = start(peer, session.chat, "hello", "smart");
    await waitForAction(peer, "chat/turnComplete", first);
    expect(await stub.agentModel()).toBe("smart");

    const second = start(peer, session.chat, "again");
    await waitForAction(peer, "chat/turnComplete", second);
    expect(await stub.agentModel()).toBe("smart");

    const state = await chatState(peer, session.chat);
    expect(state.turns.map((turn) => turn.message.model)).toEqual([{ id: "smart" }, undefined]);
  } finally {
    peer.close();
  }
});

it("rejects a turn with a model that the agent does not list", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    start(peer, session.chat, "hello", "missing");
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.rejectionReason === "Unknown model missing")).toBe(
        true,
      );
    });

    const state = await chatState(peer, session.chat);
    expect(state.turns).toEqual([]);
    expect(state.activeTurn).toBeUndefined();
  } finally {
    peer.close();
  }
});

it("admits no turn until the cancellation after a restart reaches the agent", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);
  const other = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const turnId = await startHeldTurn(peer, session.chat);

    const stub = await restart(sessionDOName(hostId, session.sessionId));
    await stub.holdNextConnection();
    peer.notify("dispatchAction", {
      channel: session.chat,
      clientSeq: 2,
      action: { type: "chat/turnCancelled", turnId, duration: 0 },
    });
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/turnCancelled")).toBe(true);
    });

    // The cancellation waits for its connection, so it still claims the agent session.
    // The first peer waits for the cancellation, so another peer starts the next turn.
    await other.request("subscribe", { channel: session.chat });
    start(other, session.chat, "too early");
    await vi.waitFor(() => {
      expect(
        other.actions.some((item) => item.rejectionReason === "A turn is already running"),
      ).toBe(true);
    });

    await stub.releaseConnection();
    await vi.waitFor(async () => {
      expect(await stub.cancellationCount()).toBe(1);
    });

    const next = start(other, session.chat, "after");
    await vi.waitFor(() => {
      expect(
        other.actions.some(
          (item) => item.action.type === "chat/turnComplete" && item.action.turnId === next,
        ),
      ).toBe(true);
    });
  } finally {
    peer.close();
    other.close();
  }
});

it("keeps the answer of a turn whose prompt a restart stopped before the agent", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const name = sessionDOName(hostId, session.sessionId);
    await env.CONVERSATIONS.getByName(name).holdAgentWrites();
    const turnId = start(peer, session.chat, "stream");
    await vi.waitFor(async () => {
      const state = await chatState(peer, session.chat);
      expect(state.activeTurn?.id).toBe(turnId);
    });

    // The new connection sends the prompt with the operation ID of the turn.
    // The agent does not know the operation, so it runs the prompt as a new one.
    const stub = await restart(name);
    const state = await endedState(peer, stub, session.chat);
    expect(state.turns).toMatchObject([
      {
        id: turnId,
        state: "complete",
        responseParts: [{ kind: "markdown", id: turnId, content: "stream" }],
      },
    ]);
  } finally {
    peer.close();
  }
});

it("reattaches to the prompt after the agent closes the connection", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const sessionId = crypto.randomUUID();
    const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, sessionId));
    await stub.useFastLifecycle({ turnAttempts: 3 });
    const session = await createPeerSession(peer, sessionId);
    await peer.request("subscribe", { channel: session.chat });
    const turnId = await startHeldTurn(peer, session.chat);

    await stub.dropAgentConnections();
    await vi.waitFor(async () => {
      await runDurableObjectAlarm(stub);
      expect(await stub.streamCounts()).toMatchObject({ total: 2 });
    });
    await stub.finishPrompt(" again");

    const state = await endedState(peer, stub, session.chat);
    expect(state.turns).toMatchObject([
      {
        id: turnId,
        state: "complete",
        responseParts: [{ kind: "markdown", id: turnId, content: "hold again" }],
      },
    ]);
  } finally {
    peer.close();
  }
});

it("records an interrupted turn as an error when the agent cannot reattach", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.sessionId));
    await stub.disableOperations();

    const interrupted = crypto.randomUUID();

    await changeSession(stub, ({ chats }, record) => {
      const chat = record.sessionState.defaultChat;

      chats.apply(chat, {
        type: AHPActionType.ChatTurnStarted,
        turnId: interrupted,
        startedAt: new Date().toISOString(),
        message: { text: "unfinished", origin: { kind: AHPMessageKind.User } },
      });

      chats.apply(chat, {
        type: AHPActionType.ChatResponsePart,
        turnId: interrupted,
        part: { kind: AHPResponsePartKind.Markdown, id: "answer", content: "partial" },
      });
    });

    await evictDurableObject(stub);
    const state = await endedState(peer, stub, session.chat);
    expect(state.turns[0]).toMatchObject({ id: interrupted, state: "error" });
    expect(state.turns[0]?.responseParts).toEqual([
      { kind: "markdown", id: "answer", content: "partial" },
      {
        kind: "error",
        error: { errorType: "agent", message: "Turn interrupted by session restart" },
      },
    ]);
  } finally {
    peer.close();
  }
});

it("sends ACP cancellation when disposing an active session", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSubscribedSession(peer);
    start(peer, session.chat, "hold");
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/responsePart")).toBe(true);
    });
    await peer.request("disposeSession", { channel: session.channel });
    const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.sessionId));
    expect(await stub.cancellationCount()).toBe(1);
  } finally {
    peer.close();
  }
});

async function creationError(operation: ReturnType<Peer["request"]>): Promise<string | null> {
  try {
    await operation;

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Creation failed";
  }
}

it.each([true, false])("notifies early subscribers when creation succeeds=%s", async (success) => {
  const hostId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const channel = `ahp-session:/${sessionId}`;
  const creator = await connectPeer(hostId);
  const observer = await connectPeer(hostId);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, sessionId));
  await stub.holdInitialization();

  try {
    const creation = creationError(creator.request("createSession", { channel, provider: "test" }));
    await vi.waitFor(async () => {
      const list = ListSessionsResultSchema.parse(
        await observer.request("listSessions", { channel: "ahp-root://" }),
      );

      expect(list.items).toHaveLength(1);
    });
    const result = SubscribeResultSchema.parse(await observer.request("subscribe", { channel }));
    expect(SessionStateSchema.parse(result.snapshot?.state).lifecycle).toBe("creating");
    await stub.releaseInitialization(success);

    expect(await creation).toBe(success ? null : "Agent setup failed");

    await vi.waitFor(() => {
      const type = success ? "session/ready" : "session/creationFailed";
      expect(observer.actions.some((item) => item.action.type === type)).toBe(true);
    });

    const list = ListSessionsResultSchema.parse(
      await observer.request("listSessions", { channel: "ahp-root://" }),
    );

    expect(list.items).toHaveLength(success ? 1 : 0);
  } finally {
    creator.close();
    observer.close();
  }
});

it("holds root notifications for a client whose initial snapshots are still loading", async () => {
  const hostId = crypto.randomUUID();
  const creator = await connectPeer(hostId);
  const session = await createSubscribedSession(creator);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.sessionId));
  await stub.holdSubscribes();

  const observer = await openPeer(hostId);

  try {
    const initialized = observer.request("initialize", {
      channel: "ahp-root://",
      clientId: crypto.randomUUID(),
      protocolVersions: [AHP_PROTOCOL_VERSION],
      initialSubscriptions: ["ahp-root://", session.channel],
    });

    await vi.waitFor(async () => {
      expect(await stub.heldSubscribeCount()).toBe(1);
    });

    const added = `ahp-session:/${crypto.randomUUID()}`;
    await creator.request("createSession", { channel: added, provider: "test" });
    expect(observer.notifications).toEqual([]);
    await stub.releaseSubscribes();
    await initialized;

    await vi.waitFor(() => {
      const addedSessions = observer.notifications
        .filter((item) => item.method === "root/sessionAdded")
        .map((item) => SessionAddedSchema.parse(item.params).summary.resource);

      expect(addedSessions).toEqual([added]);
      expect(observer.actions).toContainEqual(
        expect.objectContaining({
          action: { type: "root/activeSessionsChanged", activeSessions: 2 },
        }),
      );
    });
  } finally {
    creator.close();
    observer.close();
  }
});

it("refuses an unsupported protocol version and closes the connection", async () => {
  const peer = await openPeer(crypto.randomUUID());

  const initialized = peer.request("initialize", {
    channel: "ahp-root://",
    clientId: crypto.randomUUID(),
    protocolVersions: ["0.0.0"],
  });

  await expect(initialized).rejects.toThrow("Unsupported protocol version");
  expect(await peer.closed).toBe(CloseCode.Normal);
});
