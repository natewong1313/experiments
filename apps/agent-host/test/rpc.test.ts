import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  AhpErrorCodes as AHPErrorCodes,
  SessionOriginKind as AHPSessionOriginKind,
  MessageKind as AHPMessageKind,
  ResponsePartKind as AHPResponsePartKind,
  TurnState as AHPTurnState,
} from "@microsoft/agent-host-protocol";
import type { HostRPC, SessionRPC } from "../src";
import type { SessionCreateRequest, SessionSubscribeResponse } from "../src/shared/rpc/session";
import { buildSession, sessionSummary } from "../src/session/state";
import { HostDatabase } from "../src/host/db/database";
import { sessionsTable } from "../src/host/db/schema";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import { connectPeer } from "./peer";
import { readState, storedTables } from "./storage";
import { newRouterDOName, sessionDOName, sessionUri, chatUri } from "../src/shared/lookups";

function request(): SessionCreateRequest {
  return {
    hostId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    chatId: crypto.randomUUID(),
    provider: "test",
    createdAt: new Date().toISOString(),
  };
}

function turnStart(
  req: SessionCreateRequest,
  turnId: string,
): Parameters<SessionRPC["dispatch"]>[0] {
  return {
    channel: chatUri(req.sessionId, req.chatId),
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
  const stub: SessionRPC = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const router = newRouterDOName(req.hostId);
  const channel = sessionUri(req.sessionId);
  const chat = chatUri(req.sessionId, req.chatId);

  try {
    await expect(stub.create(req)).resolves.toBeUndefined();
    const snapshot = await stub.subscribe({ router, channel });
    expect(snapshot.state).toMatchObject({ lifecycle: "ready", defaultChat: chat });
    expect(snapshot.revision).toBe(1);
    await expect(stub.subscribe({ router, channel: chat })).resolves.toMatchObject({
      state: { resource: chat, turns: [] },
    });
    const duplicate = await rpcError(() => stub.create(req));
    expect(duplicate).toMatchObject({
      name: "SessionCreateError",
      message: "Session already exists",
    });
    const otherChat = chatUri(req.sessionId, crypto.randomUUID());
    const wrongChannel = await rpcError(() => stub.subscribe({ router, channel: otherChat }));
    expect(wrongChannel).toMatchObject({
      name: "SessionSubscribeError",
      message: "Channel does not belong to this session",
    });
    const turnId = crypto.randomUUID();
    const clientId = crypto.randomUUID();

    const rejected = await rpcError(() =>
      stub.dispatch({
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
    await stub.dispose();
  }

  await expect(stub.dispose()).resolves.toBeUndefined();
  const missing = await rpcError(() => stub.subscribe({ router, channel }));
  expect(missing).toMatchObject({
    name: "SessionSubscribeError",
    message: "Session does not exist",
    code: AHPErrorCodes.SessionNotFound,
  });
});

it("removes failed session setup and propagates its operation error over RPC", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  await stub.holdInitialization();
  await stub.releaseInitialization(false);
  const failed = await rpcError(() => stub.create(req));
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
});

it("retains opaque AHP metadata in snapshots after reconstruction and subscription", async () => {
  const req = request();
  const channel = sessionUri(req.sessionId);
  const peer = await connectPeer(req.hostId);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const metadata = { nested: { labels: ["retained"], enabled: true, value: null } };

  try {
    await peer.request("createSession", { channel, provider: "test" });

    const chat = await runInDurableObject(stub, async (_instance, ctx) => {
      const db = new SessionDatabase(ctx.storage);
      const record = db.orm.select().from(sessionTable).get();

      if (!record) {
        throw new Error("Missing session");
      }

      record.sessionState._meta = metadata;
      record.chatState._meta = metadata;
      record.chatState.activity = "Retained activity";
      record.chatState.turns.push({
        id: crypto.randomUUID(),
        state: AHPTurnState.Error,
        message: { text: "hello", origin: { kind: AHPMessageKind.User }, _meta: metadata },
        usage: { inputTokens: 1, _meta: metadata },
        responseParts: [
          {
            kind: AHPResponsePartKind.Error,
            error: { errorType: "agent", message: "Retained error", _meta: metadata },
          },
        ],
      });

      db.orm.update(sessionTable).set(record).where(eq(sessionTable.id, record.id)).run();

      return record.chatState.resource;
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

it("validates summary changes and ignores sessions absent from its catalogue", async () => {
  const req = request();
  const hosts: DurableObjectNamespace<HostRPC> = env.COORDINATORS;
  const stub = hosts.getByName(req.hostId);

  const update = {
    sessionId: req.sessionId,
    defaultChat: chatUri(req.sessionId, req.chatId),
    revision: 1,
    summary: sessionSummary(buildSession(req, "/")),
  };

  await expect(stub.summaryChanged(update)).resolves.toBeUndefined();
  const invalid = await rpcError(() => stub.summaryChanged({ ...update, revision: Number.NaN }));
  expect(invalid).toMatchObject({ name: "HostSummaryChangedError" });
});

it("retains the full AHP summary through host RPC and storage", async () => {
  const req = request();
  const stub = env.COORDINATORS.getByName(req.hostId);
  const defaultChat = chatUri(req.sessionId, req.chatId);
  const original = sessionSummary(buildSession(req, "/"));
  await runInDurableObject(stub, async (_instance, ctx) => {
    new HostDatabase(ctx.storage).orm
      .insert(sessionsTable)
      .values({ id: req.sessionId, defaultChat, summary: original })
      .run();
  });

  const summary = {
    ...original,
    title: "Updated summary",
    origin: {
      kind: AHPSessionOriginKind.Automation,
      automation: "ahp-automation:/scheduled-task",
      run: "ahp-automation-run:/scheduled-run",
    },
    _meta: { label: "retained" },
  };

  await stub.summaryChanged({ sessionId: req.sessionId, defaultChat, revision: 1, summary });

  const stored = await runInDurableObject(stub, async (_instance, ctx) => {
    const entry = new HostDatabase(ctx.storage).orm
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, req.sessionId))
      .get();

    return entry?.summary;
  });

  expect(stored).toEqual(summary);
  expect(stored?.resource).toBe(sessionUri(req.sessionId));
});

it("rejects a second concurrent turn through the public dispatch method", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const chat = chatUri(req.sessionId, req.chatId);
  await stub.create(req);
  const firstTurnId = crypto.randomUUID();
  const secondTurnId = crypto.randomUUID();

  try {
    await runInDurableObject(stub, async (instance) => {
      const starts = [firstTurnId, secondTurnId].map(
        (turnId): Parameters<SessionRPC["dispatch"]>[0] => turnStart(req, turnId),
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
  const start = turnStart(req, crypto.randomUUID());
  const error = await rpcError(() => session.dispatch(start));
  expect(error).toMatchObject({ name: "SessionDispatchError", message: "Session does not exist" });
});

it("does not cancel the agent when a cancellation targets another turn", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  const chat = chatUri(req.sessionId, req.chatId);
  const turnId = crypto.randomUUID();
  await session.create(req);

  try {
    await session.dispatch(turnStart(req, turnId));
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

it("rejects a second concurrent session creation on the same object", async () => {
  const first = request();
  const second = { ...request(), hostId: first.hostId };
  const stub = env.CONVERSATIONS.getByName(sessionDOName(first.hostId, first.sessionId));
  const channel = sessionUri(first.sessionId);

  try {
    await runInDurableObject(stub, async (instance) => {
      const results = await Promise.allSettled([instance.create(first), instance.create(second)]);
      expect(results).toMatchObject([
        { status: "fulfilled" },
        {
          status: "rejected",
          reason: { name: "SessionCreateError", message: "Session already exists" },
        },
      ]);
    });

    expect(await readState(stub, channel)).toMatchObject({
      state: { defaultChat: chatUri(first.sessionId, first.chatId), lifecycle: "ready" },
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
  const creation = rpcError(() => session.create(req));

  try {
    await vi.waitFor(async () => {
      expect(await readState(stub, channel)).toMatchObject({ state: { lifecycle: "creating" } });
    });
    await session.dispose();
    await stub.releaseInitialization(true);
    expect(await creation).toMatchObject({ name: "SessionCreateError" });
    expect(await readState(stub, channel)).toBeUndefined();

    await session.create(req);
    expect(await readState(stub, channel)).toMatchObject({
      revision: 1,
      state: { lifecycle: "ready", defaultChat: chatUri(req.sessionId, req.chatId) },
    });
  } finally {
    await stub.releaseInitialization(true);
    await creation;
    await session.dispose();
  }
});
