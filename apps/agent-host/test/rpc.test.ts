import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  ActionType as AHPActionType,
  AhpErrorCodes as AHPErrorCodes,
  MessageKind as AHPMessageKind,
  ResponsePartKind as AHPResponsePartKind,
} from "@microsoft/agent-host-protocol";
import { ChatStateSchema, SessionStateSchema } from "@experiments/protocol-schemas/ahp";
import type { HostRPC, SessionRPC } from "../src";
import type { SessionCreateRequest, SessionSubscribeResponse } from "../src/shared/rpc/session";
import { chatsTable, sessionTable } from "../src/session/db/schema";
import { connectPeer } from "./peer";
import { changeSession, readState, storedTables } from "./storage";
import type { AgentSession } from "./session";
import { newRouterDOName, sessionDOName, sessionUri, chatUri } from "../src/shared/lookups";

type TestRequest = { hostId: string; sessionId: string; params: SessionCreateRequest };

function request(hostId = crypto.randomUUID()): TestRequest {
  const sessionId = crypto.randomUUID();

  return { hostId, sessionId, params: { channel: sessionUri(sessionId), provider: "test" } };
}

/** Returns the default chat of a created session. */
async function chatOf(stub: DurableObjectStub<AgentSession>, req: TestRequest): Promise<string> {
  const stored = await readState(stub, sessionUri(req.sessionId));
  const chat = SessionStateSchema.parse(stored?.state).defaultChat;

  if (chat === undefined) {
    throw new Error("Session has no default chat");
  }

  return chat;
}

function turnStart(chat: string, turnId: string): Parameters<SessionRPC["dispatch"]>[0] {
  return {
    channel: chat,
    action: {
      type: "chat/turnStarted",
      turnId,
      startedAt: new Date().toISOString(),
      message: { text: "hold", origin: { kind: "user" } },
    },
    origin: { clientId: crypto.randomUUID(), clientSeq: 1 },
  };
}

async function rpcError(
  operation: () => Promise<void> | Promise<SessionSubscribeResponse>,
): Promise<Error> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error("RPC rejected without an Error", { cause: error });
  }

  throw new Error("RPC unexpectedly succeeded");
}

it("returns typed snapshots and named errors through the session RPC contract", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  const router = newRouterDOName(req.hostId);
  const channel = sessionUri(req.sessionId);

  try {
    await expect(session.create(req.params)).resolves.toBeUndefined();
    const chat = await chatOf(stub, req);
    const snapshot = await session.subscribe({ router, channel });
    expect(snapshot.state).toMatchObject({ lifecycle: "ready", defaultChat: chat });
    expect(snapshot.revision).toBe(1);
    await expect(session.subscribe({ router, channel: chat })).resolves.toMatchObject({
      state: { resource: chat, turns: [] },
    });
    // A repeated create with the same parameters succeeds without a new creation.
    await expect(session.create(req.params)).resolves.toBeUndefined();
    expect(await chatOf(stub, req)).toBe(chat);

    const otherDirectory = { ...req.params, workingDirectories: ["file:///other"] };
    const conflicting = await rpcError(() => session.create(otherDirectory));

    expect(conflicting).toMatchObject({
      name: "SessionCreateError",
      message: "Session already exists",
      code: AHPErrorCodes.SessionAlreadyExists,
    });
    const otherChat = chatUri(req.sessionId, crypto.randomUUID());
    const wrongChannel = await rpcError(() => session.subscribe({ router, channel: otherChat }));
    expect(wrongChannel).toMatchObject({
      name: "SessionSubscribeError",
      message: "Channel does not belong to this session",
      code: AHPErrorCodes.NotFound,
    });
    const turnId = crypto.randomUUID();
    const clientId = crypto.randomUUID();

    const rejected = await rpcError(() =>
      session.dispatch({
        channel: chat,
        action: { type: "chat/turnCancelled", turnId, duration: 0 },
        origin: { clientId, clientSeq: 1 },
      }),
    );

    expect(rejected).toMatchObject({
      name: "SessionDispatchError",
      message: "No matching active turn to cancel",
    });
  } finally {
    await session.dispose();
  }

  const disposedAgain = await rpcError(() => session.dispose());
  expect(disposedAgain).toMatchObject({
    name: "SessionDisposeError",
    code: AHPErrorCodes.SessionNotFound,
  });
  const missing = await rpcError(() => session.subscribe({ router, channel }));
  expect(missing).toMatchObject({
    name: "SessionSubscribeError",
    message: "Session does not exist",
    code: AHPErrorCodes.SessionNotFound,
  });
});

it("rejects create parameters that do not belong to the session", async () => {
  const req = request();
  const session: SessionRPC = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));

  const otherSession = { ...req.params, channel: sessionUri(crypto.randomUUID()) };
  const otherChannel = await rpcError(() => session.create(otherSession));
  expect(otherChannel.message).toBe("Channel does not belong to this session");

  const otherProvider = await rpcError(() => session.create({ ...req.params, provider: "other" }));
  expect(otherProvider).toMatchObject({ code: AHPErrorCodes.ProviderNotFound });

  const remote = { ...req.params, workingDirectories: ["https://example.com/"] };
  const remoteDirectory = await rpcError(() => session.create(remote));
  expect(remoteDirectory.message).toBe("Expected a local file working directory");
});

it("removes failed session setup and propagates its operation error over RPC", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;

  await stub.holdInitialization();
  await stub.releaseInitialization(false);
  const failed = await rpcError(() => session.create(req.params));
  expect(failed).toMatchObject({
    name: "SessionCreateError",
    message: "Agent setup failed",
  });
  const channel = sessionUri(req.sessionId);
  const router = newRouterDOName(req.hostId);
  const missing = await rpcError(() => session.subscribe({ router, channel }));
  expect(missing).toMatchObject({
    name: "SessionSubscribeError",
    message: "Session does not exist",
  });
  expect(await storedTables(stub)).toEqual([]);

  const host: HostRPC = env.COORDINATORS.getByName(req.hostId);
  const catalogue = await host.listSessions();
  expect(catalogue.items).toEqual([]);
});

it("retains opaque AHP metadata in snapshots after reconstruction and subscription", async () => {
  const req = request();
  const channel = sessionUri(req.sessionId);
  const peer = await connectPeer(req.hostId);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const metadata = { nested: { labels: ["retained"], enabled: true, value: null } };

  try {
    await peer.request("createSession", req.params);

    const chat = await changeSession(stub, ({ chats }, record, { orm }) => {
      const { defaultChat } = record.sessionState;
      const turnId = crypto.randomUUID();
      const sessionState = { ...record.sessionState, _meta: metadata };
      orm.update(sessionTable).set({ sessionState }).where(eq(sessionTable.id, record.id)).run();
      const chatRow = eq(chatsTable.resource, defaultChat);
      orm
        .update(chatsTable)
        .set({ metadata: { _meta: metadata } })
        .where(chatRow)
        .run();
      const activity = "Retained activity";
      chats.apply(defaultChat, { type: AHPActionType.ChatActivityChanged, activity });

      chats.apply(defaultChat, {
        type: AHPActionType.ChatTurnStarted,
        turnId,
        startedAt: new Date().toISOString(),
        message: { text: "hello", origin: { kind: AHPMessageKind.User }, _meta: metadata },
      });

      chats.apply(defaultChat, {
        type: AHPActionType.ChatUsage,
        turnId,
        usage: { inputTokens: 1, _meta: metadata },
      });

      chats.apply(defaultChat, {
        type: AHPActionType.ChatError,
        turnId,
        duration: 1,
        part: {
          kind: AHPResponsePartKind.Error,
          error: { errorType: "agent", message: "Retained error", _meta: metadata },
        },
      });

      return defaultChat;
    });

    await evictDurableObject(stub);
    expect(await peer.request("subscribe", { channel })).toMatchObject({
      snapshot: { state: { _meta: metadata } },
    });
    expect(await peer.request("subscribe", { channel: chat })).toMatchObject({
      snapshot: {
        state: {
          _meta: metadata,
          activity: "Retained activity",
          turns: [
            {
              message: { _meta: metadata },
              usage: { _meta: metadata },
              responseParts: [{ error: { _meta: metadata } }],
            },
          ],
        },
      },
    });
  } finally {
    await stub.dispose();
    peer.close();
  }
});

it("rejects a second concurrent turn through the public dispatch method", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  await stub.create(req.params);
  const chat = await chatOf(stub, req);
  const firstTurnId = crypto.randomUUID();
  const secondTurnId = crypto.randomUUID();

  try {
    await runInDurableObject(stub, async (instance) => {
      const starts = [firstTurnId, secondTurnId].map(
        (turnId): Parameters<SessionRPC["dispatch"]>[0] => turnStart(chat, turnId),
      );

      const results = await Promise.allSettled(starts.map((start) => instance.dispatch(start)));
      expect(results).toMatchObject([
        { status: "fulfilled" },
        {
          status: "rejected",
          reason: { name: "SessionDispatchError", message: "A turn is already running" },
        },
      ]);
    });

    expect(await readState(stub, chat)).toMatchObject({
      state: { activeTurn: { id: firstTurnId } },
    });
  } finally {
    await stub.dispose();
  }
});

it("rejects a turn start when the session does not exist", async () => {
  const req = request();
  const session: SessionRPC = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const chat = chatUri(req.sessionId, crypto.randomUUID());
  const start = turnStart(chat, crypto.randomUUID());
  const error = await rpcError(() => session.dispatch(start));
  expect(error).toMatchObject({ name: "SessionDispatchError", message: "Session does not exist" });
});

it("does not cancel the agent when a cancellation targets another turn", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  const turnId = crypto.randomUUID();
  await session.create(req.params);
  const chat = await chatOf(stub, req);

  try {
    await session.dispatch(turnStart(chat, turnId));
    await vi.waitFor(async () => {
      expect(await readState(stub, chat)).toMatchObject({
        state: { activeTurn: { id: turnId, responseParts: [{ content: "hold" }] } },
      });
    });

    const rejected = await rpcError(() =>
      session.dispatch({
        channel: chat,
        action: { type: "chat/turnCancelled", turnId: crypto.randomUUID(), duration: 0 },
        origin: { clientId: crypto.randomUUID(), clientSeq: 1 },
      }),
    );

    expect(rejected.message).toBe("No matching active turn to cancel");
    expect(await stub.cancellationCount()).toBe(0);
    expect(await readState(stub, chat)).toMatchObject({
      state: { activeTurn: { id: turnId } },
    });
  } finally {
    await session.dispose();
  }
});

it("treats a repeated turn start with the same turn ID as a no-op", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  const turnId = crypto.randomUUID();
  await session.create(req.params);
  const chat = await chatOf(stub, req);

  try {
    await session.dispatch(turnStart(chat, turnId));
    await vi.waitFor(async () => {
      expect(await readState(stub, chat)).toMatchObject({
        state: { activeTurn: { id: turnId, responseParts: [{ content: "hold" }] } },
      });
    });

    // A retry of the same turn start while the prompt runs succeeds without a second prompt.
    const restart = turnStart(chat, turnId);
    await expect(session.dispatch(restart)).resolves.toBeUndefined();

    // A retry after the turn ends also succeeds without recording another turn.
    await stub.finishPrompt();
    await vi.waitFor(async () => {
      expect(await readState(stub, chat)).toMatchObject({
        state: { turns: [{ id: turnId, state: "complete" }] },
      });
    });
    const afterComplete = turnStart(chat, turnId);
    await expect(session.dispatch(afterComplete)).resolves.toBeUndefined();

    const state = await readState(stub, chat);
    const parsed = ChatStateSchema.parse(state?.state);
    const { turns } = parsed;
    const matching = turns.filter((turn) => turn.id === turnId);
    expect(matching).toHaveLength(1);
  } finally {
    await session.dispose();
  }
});

it("treats a repeated cancellation of the same turn as a no-op", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  const turnId = crypto.randomUUID();
  await session.create(req.params);
  const chat = await chatOf(stub, req);

  try {
    await session.dispatch(turnStart(chat, turnId));
    await vi.waitFor(async () => {
      expect(await readState(stub, chat)).toMatchObject({ state: { activeTurn: { id: turnId } } });
    });

    const cancel = {
      channel: chat,
      action: { type: "chat/turnCancelled" as const, turnId, duration: 0 },
      origin: { clientId: crypto.randomUUID(), clientSeq: 1 },
    };

    await session.dispatch(cancel);
    await vi.waitFor(async () => {
      expect(await readState(stub, chat)).toMatchObject({
        state: { turns: [{ id: turnId, state: "cancelled" }] },
      });
    });
    expect(await stub.cancellationCount()).toBe(1);

    // A retry of the cancellation after the turn ended succeeds without cancelling the agent again.
    await expect(session.dispatch(cancel)).resolves.toBeUndefined();
    expect(await stub.cancellationCount()).toBe(1);
  } finally {
    await session.dispose();
  }
});

it("joins a concurrent creation with the same parameters and rejects other parameters", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const channel = sessionUri(req.sessionId);
  const other = { ...req.params, workingDirectories: ["file:///other"] };

  try {
    await runInDurableObject(stub, async (instance) => {
      const results = await Promise.allSettled([
        instance.create(req.params),
        instance.create(req.params),
        instance.create(other),
      ]);

      expect(results).toMatchObject([
        { status: "fulfilled" },
        { status: "fulfilled" },
        {
          status: "rejected",
          reason: { name: "SessionCreateError", message: "Session already exists" },
        },
      ]);
    });

    expect(await readState(stub, channel)).toMatchObject({
      revision: 1,
      state: { lifecycle: "ready", workingDirectories: ["file:///"] },
    });
  } finally {
    await stub.dispose();
  }
});

it("rejects agent initialization after disposal and can recreate the session on the same instance", async () => {
  const req = request();
  const channel = sessionUri(req.sessionId);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  await stub.holdInitialization();
  const creation = rpcError(() => session.create(req.params));

  try {
    await vi.waitFor(async () => {
      expect(await readState(stub, channel)).toMatchObject({ state: { lifecycle: "creating" } });
    });
    const firstChat = await chatOf(stub, req);
    await session.dispose();
    await stub.releaseInitialization(true);
    expect(await creation).toMatchObject({
      name: "SessionCreateError",
      code: AHPErrorCodes.SessionNotFound,
    });
    expect(await readState(stub, channel)).toBeUndefined();

    await session.create(req.params);
    expect(await readState(stub, channel)).toMatchObject({
      revision: 1,
      state: { lifecycle: "ready" },
    });
    expect(await chatOf(stub, req)).not.toBe(firstChat);
  } finally {
    await stub.releaseInitialization(true);
    await creation;
    await session.dispose();
  }
});
