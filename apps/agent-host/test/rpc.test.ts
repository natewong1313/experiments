import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import {
  SessionOriginKind,
  MessageKind,
  ResponsePartKind,
  TurnState,
} from "@microsoft/agent-host-protocol";
import type {
  HostRPC,
  SessionRPC,
  SessionNamespace,
  SessionCreateRequest,
  SessionSnapshotResponse,
} from "../src";
import { buildSession } from "../src/session/state";
import { HostDatabase } from "../src/host/db/database";
import { SessionDatabase } from "../src/session/db/database";
import { connectPeer } from "./peer";
import { sessionDOName, sessionUri, chatUri } from "../src/shared/lookups";

function request(): SessionCreateRequest {
  return {
    hostId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    chatId: crypto.randomUUID(),
    provider: "test",
    createdAt: new Date().toISOString(),
  };
}

async function rpcError(
  operation: () => Promise<void> | Promise<SessionSnapshotResponse>,
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
  const sessions: SessionNamespace = env.CONVERSATIONS;
  const stub: SessionRPC = sessions.getByName(sessionDOName(req.hostId, req.sessionId));
  const channel = sessionUri(req.sessionId);
  const chat = chatUri(req.chatId);

  try {
    await expect(stub.create(req)).resolves.toBeUndefined();
    const snapshot = await stub.snapshot({ channel: sessionUri(req.sessionId) });
    expect(snapshot.state).toMatchObject({ lifecycle: "ready", defaultChat: chatUri(req.chatId) });
    expect(snapshot.revision).toBe(1);
    await expect(stub.snapshot({ channel: chat })).resolves.toMatchObject({
      state: { resource: chatUri(req.chatId), turns: [] },
    });
    const duplicate = await rpcError(() => stub.create(req));
    expect(duplicate).toMatchObject({
      name: "SessionCreateError",
      message: "Session already exists",
    });
    const otherChat = chatUri(crypto.randomUUID());
    const wrongChannel = await rpcError(() => stub.snapshot({ channel: otherChat }));
    expect(wrongChannel).toMatchObject({
      name: "SessionSnapshotError",
      message: "Channel does not belong to this session",
    });
    const turnId = crypto.randomUUID();
    const clientId = crypto.randomUUID();

    const rejected = await rpcError(() =>
      stub.dispatch({
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
  const missing = await rpcError(() => stub.snapshot({ channel }));
  expect(missing).toMatchObject({
    name: "SessionSnapshotError",
    message: "Session does not exist",
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
  const missing = await rpcError(() => session.snapshot({ channel }));
  expect(missing).toMatchObject({
    name: "SessionSnapshotError",
    message: "Session does not exist",
  });
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
      const repository = new SessionDatabase(ctx.storage).session;
      const record = await repository.get();

      if (!record) {
        throw new Error("Missing session");
      }

      record.sessionState._meta = metadata;
      record.chatState._meta = metadata;
      record.chatState.activity = "Retained activity";
      record.chatState.turns.push({
        id: crypto.randomUUID(),
        state: TurnState.Error,
        message: { text: "hello", origin: { kind: MessageKind.User }, _meta: metadata },
        usage: { inputTokens: 1, _meta: metadata },
        responseParts: [
          {
            kind: ResponsePartKind.Error,
            error: { errorType: "agent", message: "Retained error", _meta: metadata },
          },
        ],
      });
      await repository.save(record);

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

it("validates host updates and ignores sessions absent from its catalogue", async () => {
  const req = request();
  const hosts: DurableObjectNamespace<HostRPC> = env.COORDINATORS;
  const stub = hosts.getByName(req.hostId);

  const update = {
    sessionId: req.sessionId,
    revision: 1,
    summary: buildSession(req, "/").summary,
    actions: [],
  };

  await expect(stub.sessionUpdate(update)).resolves.toBeUndefined();
  const invalid = await rpcError(() => stub.sessionUpdate({ ...update, revision: Number.NaN }));
  expect(invalid).toMatchObject({
    name: "HostSessionUpdateError",
  });
});

it("retains the full AHP summary through host RPC and storage", async () => {
  const req = request();
  const stub = env.COORDINATORS.getByName(req.hostId);
  const original = buildSession(req, "/").summary;
  await runInDurableObject(stub, async (_instance, ctx) => {
    const database = new HostDatabase(ctx.storage);
    await database.host.initialize(req.hostId);
    await database.sessions.create({
      id: req.sessionId,
      defaultChatId: req.chatId,
      summary: original,
    });
  });

  const summary = {
    ...original,
    title: "Updated summary",
    origin: {
      kind: SessionOriginKind.Automation,
      automation: "ahp-automation:/scheduled-task",
      run: "ahp-automation-run:/scheduled-run",
    },
    _meta: { label: "retained" },
  };

  await stub.sessionUpdate({ sessionId: req.sessionId, revision: 1, summary, actions: [] });

  const stored = await runInDurableObject(stub, async (_instance, ctx) => {
    const entry = await new HostDatabase(ctx.storage).sessions.get(req.sessionId);

    return entry?.summary;
  });

  expect(stored).toEqual(summary);
  expect(stored?.resource).toBe(sessionUri(req.sessionId));
});

it("rejects a second concurrent turn through the public dispatch method", async () => {
  const req = request();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  await stub.create(req);
  const firstTurnId = crypto.randomUUID();
  const secondTurnId = crypto.randomUUID();

  try {
    await runInDurableObject(stub, async (instance) => {
      const starts = [firstTurnId, secondTurnId].map(
        (turnId): Parameters<SessionRPC["dispatch"]>[0] => ({
          action: {
            type: "chat/turnStarted",
            turnId,
            startedAt: new Date().toISOString(),
            message: { text: "hold", origin: { kind: "user" } },
          },
          origin: { clientId: crypto.randomUUID(), clientSeq: 1 },
        }),
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

    const snapshot = await session.snapshot({ channel: chatUri(req.chatId) });
    expect(snapshot.state).toMatchObject({ activeTurn: { id: firstTurnId } });
  } finally {
    await stub.dispose();
  }
});

it("rejects a second concurrent session creation on the same object", async () => {
  const first = request();
  const second = { ...request(), hostId: first.hostId };
  const stub = env.CONVERSATIONS.getByName(sessionDOName(first.hostId, first.sessionId));
  const session: SessionRPC = stub;

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

    const snapshot = await session.snapshot({ channel: sessionUri(first.sessionId) });
    expect(snapshot.state).toMatchObject({
      defaultChat: chatUri(first.chatId),
      lifecycle: "ready",
    });
  } finally {
    await stub.dispose();
  }
});
