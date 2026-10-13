import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  ChatStateSchema,
  type ChatState,
  SessionStateSchema,
  ListSessionsResultSchema,
  SubscribeResultSchema,
} from "@experiments/protocol-schemas/ahp";
import worker from "./worker";
import { connectPeer } from "./peer";
import type { Peer } from "./peer";
import { SessionDatabase } from "../src/session/db/database";
import { MessageKind } from "@microsoft/agent-host-protocol";
import { sessionKey } from "../src/protocol";

type CreatedSession = { sessionId: string; channel: string; chat: string };

const NOT_FOUND = 404;

async function createSession(peer: Peer): Promise<CreatedSession> {
  const sessionId = crypto.randomUUID();
  const channel = `ahp-session:/${sessionId}`;
  await peer.request("createSession", { channel, provider: "test" });
  const subscribed = SubscribeResultSchema.parse(await peer.request("subscribe", { channel }));
  const state = SessionStateSchema.parse(subscribed.snapshot?.state);

  if (state.defaultChat === undefined) {
    throw new Error("Session has no default chat");
  }

  await peer.request("subscribe", { channel: state.defaultChat });

  return { sessionId, channel, chat: state.defaultChat };
}

function start(peer: Peer, chat: string, text: string): string {
  const turnId = crypto.randomUUID();
  peer.notify("dispatchAction", {
    channel: chat,
    clientSeq: 1,
    action: {
      type: "chat/turnStarted",
      turnId,
      startedAt: new Date().toISOString(),
      message: { text, origin: { kind: "user" } },
    },
  });

  return turnId;
}

async function chatState(peer: Peer, chat: string): Promise<ChatState> {
  const result = SubscribeResultSchema.parse(await peer.request("subscribe", { channel: chat }));

  return ChatStateSchema.parse(result.snapshot?.state);
}

it("routes UUID hosts and rejects an invalid host path", async () => {
  const response = await worker.fetch(new Request("https://host/hosts/not-a-uuid/ahp"), env);
  expect(response.status).toBe(NOT_FOUND);
});

it("streams the same turn to two clients and retains it after reconstruction", async () => {
  const hostId = crypto.randomUUID();
  const first = await connectPeer(hostId);
  const second = await connectPeer(hostId);

  try {
    const session = await createSession(first);
    await second.request("subscribe", { channel: session.chat });
    const turnId = start(first, session.chat, "hello");
    await vi.waitFor(() => {
      expect(first.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
      expect(second.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
    });
    const echoed = first.actions.find((item) => item.action.type === "chat/turnStarted");
    expect(echoed?.origin).toMatchObject({ clientSeq: 1 });
    expect(first.actions.filter((item) => item.channel === session.chat)).toEqual(
      second.actions.filter((item) => item.channel === session.chat),
    );
    const before = await chatState(first, session.chat);
    expect(before.turns[0]).toMatchObject({
      id: turnId,
      state: "complete",
      responseParts: [{ kind: "markdown", content: "hello" }],
    });
    const sessionStub = env.CONVERSATIONS.getByName(sessionKey(hostId, session.sessionId));
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

it("runs another session while one is waiting and rejects a second active turn", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const first = await createSession(peer);
    const second = await createSession(peer);
    const held = start(peer, first.chat, "hold");
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/delta")).toBe(true);
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
  const session = await createSession(first);
  start(first, session.chat, "hold");
  await vi.waitFor(() => {
    expect(first.actions.some((item) => item.action.type === "chat/delta")).toBe(true);
  });
  first.close();
  await env.CONVERSATIONS.getByName(sessionKey(hostId, session.sessionId)).finishPrompt();
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

it("records an interrupted turn as an error on reconstruction", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSession(peer);
    const stub = env.CONVERSATIONS.getByName(sessionKey(hostId, session.sessionId));
    await runInDurableObject(stub, (_instance, ctx) => {
      const repository = new SessionDatabase(ctx.storage).session;
      const record = repository.get();

      if (!record) {
        throw new Error("Missing session");
      }

      record.chatState.activeTurn = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        message: { text: "unfinished", origin: { kind: MessageKind.User } },
        responseParts: [],
        usage: undefined,
      };
      repository.save(record);
    });
    await evictDurableObject(stub);
    const state = await chatState(peer, session.chat);
    expect(state.activeTurn).toBeUndefined();
    expect(state.turns[0]?.state).toBe("error");
    expect(state.turns[0]?.responseParts).toContainEqual({
      kind: "error",
      error: { errorType: "agent", message: "Turn interrupted by session restart" },
    });
  } finally {
    peer.close();
  }
});

it("sends ACP cancellation when disposing an active session", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);

  try {
    const session = await createSession(peer);
    start(peer, session.chat, "hold");
    await vi.waitFor(() => {
      expect(peer.actions.some((item) => item.action.type === "chat/delta")).toBe(true);
    });
    await peer.request("disposeSession", { channel: session.channel });
    const stub = env.CONVERSATIONS.getByName(sessionKey(hostId, session.sessionId));
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
  const stub = env.CONVERSATIONS.getByName(sessionKey(hostId, sessionId));
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
