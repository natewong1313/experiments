import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  SessionOriginKind as AHPSessionOriginKind,
  MessageKind as AHPMessageKind,
  ResponsePartKind as AHPResponsePartKind,
  TurnState as AHPTurnState,
} from "@microsoft/agent-host-protocol";
import type {
  HostRPC,
  SessionRPC,
  SessionNamespace,
  SessionCreateRequest,
  SessionSnapshotResponse,
} from "../src";
import { buildSession, sessionSummary } from "../src/session/state";
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

    const chat = await runInDurableObject(stub, (_instance, ctx) =>
      new SessionDatabase(ctx.storage).session.update((record) => {
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

        return record.chatState.resource;
      }),
    );

    if (chat === undefined) {
      throw new Error("Missing session");
    }

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
    summary: sessionSummary(buildSession(req, "/")),
    actions: [],
  };

  await expect(stub.sessionUpdate(update)).resolves.toBeUndefined();
  const invalid = await rpcError(() => stub.sessionUpdate({ ...update, revision: Number.NaN }));
  expect(invalid).toMatchObject({
    name: "HostSessionUpdateError",
  });
});

it("rejects host updates with two actions on one channel", async () => {
  const req = request();
  const stub = env.COORDINATORS.getByName(req.hostId);
  const turnId = crypto.randomUUID();
  const summary = sessionSummary(buildSession(req, "/"));

  const action = {
    channel: chatUri(req.chatId),
    action: { type: "chat/turnCancelled" as const, turnId, duration: 0 },
  };

  const rejected = await rpcError(() =>
    stub.sessionUpdate({
      sessionId: req.sessionId,
      revision: 1,
      summary,
      actions: [action, action],
    }),
  );

  expect(rejected).toMatchObject({ name: "HostSessionUpdateError" });
  expect(rejected.message).toContain("Expected at most one action per channel");
});

it("retains the full AHP summary through host RPC and storage", async () => {
  const req = request();
  const stub = env.COORDINATORS.getByName(req.hostId);
  const original = sessionSummary(buildSession(req, "/"));
  await runInDurableObject(stub, async (_instance, ctx) => {
    await new HostDatabase(ctx.storage).sessions.create({
      id: req.sessionId,
      defaultChatId: req.chatId,
      summary: original,
    });
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

it("rejects agent initialization after disposal and can recreate the session on the same instance", async () => {
  const req = request();
  const channel = sessionUri(req.sessionId);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  await stub.holdInitialization();
  const creation = rpcError(() => session.create(req));

  try {
    await vi.waitFor(async () => {
      const snapshot = await session.snapshot({ channel });
      expect(snapshot.state).toMatchObject({ lifecycle: "creating" });
    });
    await session.dispose();
    await stub.releaseInitialization(true);
    expect(await creation).toMatchObject({ name: "SessionCreateError" });
    const missing = await rpcError(() => session.snapshot({ channel }));
    expect(missing).toMatchObject({
      name: "SessionSnapshotError",
      message: "Session does not exist",
    });

    await session.create(req);
    expect(await session.snapshot({ channel })).toMatchObject({
      revision: 1,
      state: { lifecycle: "ready", defaultChat: chatUri(req.chatId) },
    });
  } finally {
    await stub.releaseInitialization(true);
    await creation;
    await session.dispose();
  }
});
