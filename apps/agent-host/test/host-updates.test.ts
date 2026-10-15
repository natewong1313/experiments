import { env } from "cloudflare:workers";
import { asc, eq } from "drizzle-orm";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import * as z from "zod";
import {
  ActionType as AHPActionType,
  SessionStatus as AHPSessionStatus,
} from "@microsoft/agent-host-protocol";
import type { SessionCreateRequest, HostSessionUpdateRequest, SessionRPC } from "../src";
import type { SessionEntry } from "../src/host/db/schema";
import { HostDatabase } from "../src/host/db/database";
import { SessionDatabase } from "../src/session/db/database";
import { hostUpdatesTable, sessionTable } from "../src/session/db/schema";
import type { SessionRecord } from "../src/session/db/schema";
import { HostUpdatesService } from "../src/session/service/host-updates";
import { applySession, buildSession, sessionSummary } from "../src/session/state";
import { chatUri, sessionDOName, sessionUri } from "../src/shared/lookups";
import { connectPeer } from "./peer";

const NEXT_REVISION = 2;
const TIMEOUT_TEST_MS = 15_000;
const ClientAttachmentSchema = z.object({ clientId: z.string().optional() });

async function createSession(): Promise<SessionCreateRequest> {
  const req: SessionCreateRequest = {
    hostId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    chatId: crypto.randomUUID(),
    provider: "test",
    createdAt: new Date().toISOString(),
  };

  await runInDurableObject(env.COORDINATORS.getByName(req.hostId), async (_instance, ctx) => {
    const summary = sessionSummary(buildSession(req, "/"));

    await new HostDatabase(ctx.storage).sessions.create({
      id: req.sessionId,
      defaultChatId: req.chatId,
      summary,
    });
  });
  await env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId)).create(req);

  return req;
}

function rename(record: SessionRecord, title: string): HostSessionUpdateRequest {
  record.sessionState.title = title;

  return applySession(record, { type: AHPActionType.SessionReady });
}

async function hostState(
  req: SessionCreateRequest,
): Promise<{ entry: SessionEntry | undefined; sequence: number }> {
  return await runInDurableObject(
    env.COORDINATORS.getByName(req.hostId),
    async (_instance, ctx) => {
      const db = new HostDatabase(ctx.storage);

      return { entry: db.sessions.get(req.sessionId), sequence: await db.host.serverSeq() };
    },
  );
}

async function makeRetryDue(req: SessionCreateRequest): Promise<void> {
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);
    const pending = db.orm.select().from(hostUpdatesTable).orderBy(asc(hostUpdatesTable.id)).get();

    if (!pending) {
      throw new Error("Missing pending update");
    }

    db.orm
      .update(hostUpdatesTable)
      .set({ attempts: pending.attempts, retryAt: Date.now() })
      .where(eq(hostUpdatesTable.id, pending.id))
      .run();
    expect(await ctx.storage.getAlarm()).not.toBeNull();
  });
}

it("delivers a saved change after the session restarts", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);

    const updates = new HostUpdatesService(db, async (): Promise<void> => {
      throw new Error("Delivery must wait for the alarm");
    });

    expect(await updates.save((record) => rename(record, "Saved before restart"))).toBe(true);
    const pending = db.orm.select().from(hostUpdatesTable).orderBy(asc(hostUpdatesTable.id)).get();
    expect(pending?.update).toMatchObject({
      revision: NEXT_REVISION,
      defaultChat: chatUri(req.chatId),
    });
    expect(await ctx.storage.getAlarm()).not.toBeNull();
  });

  const before = await hostState(req);
  expect(before.entry?.summary.title).toBe("New session");
  await evictDurableObject(stub);
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  const after = await hostState(req);
  expect(after.entry?.summary.title).toBe("Saved before restart");
  const session: SessionRPC = stub;
  const snapshot = await session.snapshot({ channel: sessionUri(req.sessionId) });
  expect(snapshot).toMatchObject({
    state: { title: "Saved before restart" },
  });
  await runInDurableObject(stub, async (_instance, ctx) => {
    const pending = new SessionDatabase(ctx.storage).orm
      .select()
      .from(hostUpdatesTable)
      .orderBy(asc(hostUpdatesTable.id))
      .get();

    expect(pending).toBeUndefined();
    expect(await ctx.storage.getAlarm()).toBeNull();
  });
});

it("retries a lost reply without broadcasting the accepted update twice", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const peer = await connectPeer(req.hostId);
  await peer.request("subscribe", { channel: sessionUri(req.sessionId) });

  await runInDurableObject(stub, async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);

    const updates = new HostUpdatesService(db, async (hostId, update): Promise<void> => {
      await env.COORDINATORS.getByName(hostId).sessionUpdate(update);
      throw Object.assign(new Error("Reply lost"), { retryable: true });
    });

    await updates.save((record) => rename(record, "Accepted once"));
    await updates.flush();
    const pending = db.orm.select().from(hostUpdatesTable).orderBy(asc(hostUpdatesTable.id)).get();
    expect(pending).toMatchObject({ attempts: 1, error: "Reply lost" });
  });

  await vi.waitFor(() => {
    expect(peer.actions).toHaveLength(1);
  });
  const accepted = await hostState(req);
  await evictDurableObject(env.COORDINATORS.getByName(req.hostId));
  await evictDurableObject(stub);
  await makeRetryDue(req);
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  expect(await hostState(req)).toEqual(accepted);
  expect(peer.actions).toHaveLength(1);
  await runInDurableObject(stub, (_instance, ctx) => {
    const pending = new SessionDatabase(ctx.storage).orm
      .select()
      .from(hostUpdatesTable)
      .orderBy(asc(hostUpdatesTable.id))
      .get();

    expect(pending).toBeUndefined();
  });
});

it("keeps later changes behind a failed delivery and sends them in order", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const peer = await connectPeer(req.hostId);
  await peer.request("subscribe", { channel: "ahp-root://" });

  await runInDurableObject(stub, async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);

    const deliver = vi.fn<() => Promise<void>>(async () => {
      throw Object.assign(new Error("Host unavailable"), { retryable: true });
    });

    const updates = new HostUpdatesService(db, deliver);
    await updates.save((record) => rename(record, "First change"));
    await updates.flush();
    await updates.save((record) => rename(record, "Second change"));
    await updates.flush();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(await ctx.storage.getAlarm()).not.toBeNull();
  });

  const before = await hostState(req);
  expect(before.entry?.summary.title).toBe("New session");
  await evictDurableObject(stub);
  await makeRetryDue(req);
  await runDurableObjectAlarm(stub);
  const after = await hostState(req);
  expect(after.entry?.summary.title).toBe("Second change");
  await vi.waitFor(() => {
    const changes = peer.notifications.filter(
      (item) => item.method === "root/sessionSummaryChanged",
    );

    expect(changes.map((item) => item.params)).toEqual([
      {
        channel: "ahp-root://",
        session: sessionUri(req.sessionId),
        changes: { title: "First change" },
      },
      {
        channel: "ahp-root://",
        session: sessionUri(req.sessionId),
        changes: { title: "Second change" },
      },
    ]);
  });
});

it("rolls back the session change and pending update when alarm scheduling fails", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);
    const updates = new HostUpdatesService(db, async (): Promise<void> => {});

    const schedule = vi.spyOn(updates, "schedule").mockRejectedValueOnce(new Error("Alarm failed"));

    try {
      await expect(updates.save((record) => rename(record, "Must roll back"))).rejects.toThrow(
        "Alarm failed",
      );
    } finally {
      schedule.mockRestore();
    }

    expect(db.orm.select().from(sessionTable).get()).toMatchObject({
      revision: 1,
      sessionState: { title: "New session" },
    });
    const pending = db.orm.select().from(hostUpdatesTable).orderBy(asc(hostUpdatesTable.id)).get();
    expect(pending).toBeUndefined();
    expect(await ctx.storage.getAlarm()).toBeNull();

    expect(
      await updates.save((record): undefined => {
        record.sessionState.title = "Skipped change";

        return undefined;
      }),
    ).toBe(false);
    expect(db.orm.select().from(sessionTable).get()).toMatchObject({
      sessionState: { title: "New session" },
    });

    const stillPending = db.orm
      .select()
      .from(hostUpdatesTable)
      .orderBy(asc(hostUpdatesTable.id))
      .get();

    expect(stillPending).toBeUndefined();
  });
});

it("retains permanent delivery failures without scheduling more attempts", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);

    const updates = new HostUpdatesService(db, async (): Promise<void> => {
      throw new Error("Rejected update");
    });

    await updates.save((record) => rename(record, "Saved locally"));
    await expect(updates.flush()).resolves.toBeUndefined();
    await expect(updates.flush()).resolves.toBeUndefined();
    const pending = db.orm.select().from(hostUpdatesTable).orderBy(asc(hostUpdatesTable.id)).get();
    expect(pending).toMatchObject({ retryAt: null, error: "Rejected update" });
    expect(await ctx.storage.getAlarm()).toBeNull();
    expect(db.orm.select().from(sessionTable).get()).toMatchObject({
      sessionState: { title: "Saved locally" },
    });
  });

  await stub.retryHostUpdates();
  const after = await hostState(req);
  expect(after.entry?.summary.title).toBe("Saved locally");
  await runInDurableObject(stub, (_instance, ctx) => {
    const pending = new SessionDatabase(ctx.storage).orm
      .select()
      .from(hostUpdatesTable)
      .orderBy(asc(hostUpdatesTable.id))
      .get();

    expect(pending).toBeUndefined();
  });
});

it("starts and cancels a prompt while a permanent host failure awaits repair", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;

  await runInDurableObject(stub, async (_instance, ctx) => {
    const updates = new HostUpdatesService(
      new SessionDatabase(ctx.storage),
      async (): Promise<void> => {
        throw new Error("Host needs repair");
      },
    );

    await updates.save((record) => rename(record, "Saved during host failure"));
    await updates.flush();
  });

  const turnId = crypto.randomUUID();
  const origin = { clientId: crypto.randomUUID(), clientSeq: 1 };

  try {
    await session.dispatch({
      action: {
        type: "chat/turnStarted",
        turnId,
        startedAt: new Date().toISOString(),
        message: { text: "hold", origin: { kind: "user" } },
      },
      origin,
    });
    await vi.waitFor(async () => {
      const snapshot = await session.snapshot({ channel: chatUri(req.chatId) });
      expect(snapshot.state).toMatchObject({
        activeTurn: { id: turnId, responseParts: [{ content: "hold" }] },
      });
    });
    await session.dispatch({ action: { type: "chat/turnCancelled", turnId, duration: 0 }, origin });
    expect(await stub.cancellationCount()).toBe(1);
    const cancelled = await session.snapshot({ channel: chatUri(req.chatId) });
    expect(cancelled.state).toMatchObject({ turns: [{ id: turnId, state: "cancelled" }] });
    await session.retryHostUpdates();
    const after = await hostState(req);
    expect(after.entry?.summary).toMatchObject({
      title: "Saved during host failure",
      status: AHPSessionStatus.Idle,
    });
  } finally {
    await session.dispose();
  }
});

it("starts and cancels a prompt when delivery scheduling fails after the change is saved", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));
  const session: SessionRPC = stub;
  const turnId = crypto.randomUUID();
  const origin = { clientId: crypto.randomUUID(), clientSeq: 1 };

  try {
    await stub.failDeliveryScheduling();
    await session.dispatch({
      action: {
        type: "chat/turnStarted",
        turnId,
        startedAt: new Date().toISOString(),
        message: { text: "hold", origin: { kind: "user" } },
      },
      origin,
    });
    await vi.waitFor(async () => {
      const snapshot = await session.snapshot({ channel: chatUri(req.chatId) });
      expect(snapshot.state).toMatchObject({
        activeTurn: { id: turnId, responseParts: [{ content: "hold" }] },
      });
    });
    await stub.failDeliveryScheduling();
    await session.dispatch({ action: { type: "chat/turnCancelled", turnId, duration: 0 }, origin });
    expect(await stub.cancellationCount()).toBe(1);
    const snapshot = await session.snapshot({ channel: chatUri(req.chatId) });
    expect(snapshot.state).toMatchObject({ turns: [{ id: turnId, state: "cancelled" }] });
    await makeRetryDue(req);
    await runDurableObjectAlarm(stub);
    const after = await hostState(req);
    expect(after.entry?.summary.status).toBe(AHPSessionStatus.Idle);
  } finally {
    await session.dispose();
  }
});

it("clears pending updates on disposal and ignores late updates for a replaced session", async () => {
  const req = await createSession();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));

  const oldUpdate = await runInDurableObject(stub, async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);
    const updates = new HostUpdatesService(db, async (): Promise<void> => {});
    await updates.save((record) => rename(record, "Old session"));

    return db.orm.select().from(hostUpdatesTable).orderBy(asc(hostUpdatesTable.id)).get()?.update;
  });

  expect(oldUpdate).toBeDefined();
  await stub.dispose();
  await runInDurableObject(stub, async (_instance, ctx) => {
    const pending = new SessionDatabase(ctx.storage).orm
      .select()
      .from(hostUpdatesTable)
      .orderBy(asc(hostUpdatesTable.id))
      .get();

    expect(pending).toBeUndefined();
    expect(await ctx.storage.getAlarm()).toBeNull();
  });

  await runInDurableObject(env.COORDINATORS.getByName(req.hostId), async (_instance, ctx) => {
    const db = new HostDatabase(ctx.storage);
    await db.sessions.remove(req.sessionId);
    const summary = sessionSummary(buildSession(req, "/"));

    await db.sessions.create({
      id: req.sessionId,
      defaultChatId: crypto.randomUUID(),
      summary,
    });
  });

  if (!oldUpdate) {
    throw new Error("Missing old update");
  }

  await env.COORDINATORS.getByName(req.hostId).sessionUpdate(oldUpdate);
  const after = await hostState(req);
  expect(after.entry).toMatchObject({
    revision: 0,
    summary: { title: "New session" },
  });
});

it("ignores concurrent duplicates and older revisions after a host restart", async () => {
  const req = await createSession();
  const host = env.COORDINATORS.getByName(req.hostId);
  const record = buildSession(req, "/");
  record.revision = 1;
  const update = { ...rename(record, "Latest title"), defaultChat: chatUri(req.chatId) };

  await Promise.all([host.sessionUpdate(update), host.sessionUpdate(update)]);
  const accepted = await hostState(req);
  await evictDurableObject(host);
  await host.sessionUpdate(update);
  await host.sessionUpdate({
    ...update,
    revision: 1,
    summary: { ...update.summary, title: "Stale title" },
  });
  expect(await hostState(req)).toEqual(accepted);
  expect(accepted.entry).toMatchObject({
    revision: NEXT_REVISION,
    summary: { title: "Latest title" },
  });
});

it("closes a broken subscriber and continues delivery to other subscribers", async () => {
  const req = await createSession();
  const host = env.COORDINATORS.getByName(req.hostId);
  const brokenClientId = crypto.randomUUID();
  const broken = await connectPeer(req.hostId, brokenClientId);
  const healthy = await connectPeer(req.hostId);
  const channel = sessionUri(req.sessionId);
  await broken.request("subscribe", { channel });
  await healthy.request("subscribe", { channel });
  await runInDurableObject(host, (_instance, ctx) => {
    for (const socket of ctx.getWebSockets()) {
      const attachment = ClientAttachmentSchema.parse(socket.deserializeAttachment());

      if (attachment.clientId === brokenClientId) {
        socket.serializeAttachment(null);
      }
    }
  });
  await evictDurableObject(host);
  const record = buildSession(req, "/");
  record.revision = 1;
  const update = { ...rename(record, "Delivery continues"), defaultChat: chatUri(req.chatId) };
  await expect(host.sessionUpdate(update)).resolves.toBeUndefined();
  await vi.waitFor(() => {
    expect(healthy.actions).toHaveLength(1);
  });
  const after = await hostState(req);
  expect(after.entry?.summary.title).toBe("Delivery continues");
});

it("rolls back host acceptance and sequence allocation together", async () => {
  const req = await createSession();
  const before = await hostState(req);
  const record = buildSession(req, "/");
  record.revision = 1;
  const update = { ...rename(record, "Must roll back"), defaultChat: chatUri(req.chatId) };

  await runInDurableObject(env.COORDINATORS.getByName(req.hostId), (_instance, ctx) => {
    const db = new HostDatabase(ctx.storage);

    function abort(): never {
      db.sessions.update({ id: req.sessionId, summary: update.summary, revision: update.revision });
      db.host.nextServerSeq();
      throw new Error("Abort acceptance");
    }

    expect(() => db.transactionSync(abort)).toThrow("Abort acceptance");
  });
  expect(await hostState(req)).toEqual(before);
  await env.COORDINATORS.getByName(req.hostId).sessionUpdate(update);
  const after = await hostState(req);
  expect(after.entry?.summary.title).toBe("Must roll back");
});

it(
  "stops waiting for a stalled host and keeps the update for retry",
  async () => {
    const req = await createSession();
    const stub = env.CONVERSATIONS.getByName(sessionDOName(req.hostId, req.sessionId));

    await runInDurableObject(stub, async (_instance, ctx) => {
      const db = new SessionDatabase(ctx.storage);
      const reply = Promise.withResolvers<null>();

      const updates = new HostUpdatesService(db, async (): Promise<void> => {
        await reply.promise;
      });

      await updates.save((record) => rename(record, "Waiting for host"));

      try {
        await updates.flush();

        const pending = db.orm
          .select()
          .from(hostUpdatesTable)
          .orderBy(asc(hostUpdatesTable.id))
          .get();

        expect(pending).toMatchObject({
          attempts: 1,
          error: "Host update timed out",
        });
        expect(await ctx.storage.getAlarm()).not.toBeNull();
      } finally {
        reply.resolve(null);
      }
    });
    await makeRetryDue(req);
    await runDurableObjectAlarm(stub);
    const after = await hostState(req);
    expect(after.entry?.summary.title).toBe("Waiting for host");
  },
  TIMEOUT_TEST_MS,
);
