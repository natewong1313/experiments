import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { AhpErrorCodes as AHPErrorCodes } from "@microsoft/agent-host-protocol";
import { SessionStateSchema } from "@experiments/protocol-schemas/ahp";
import type { HostRPC, SessionRPC } from "../src";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import type { SessionRecord } from "../src/session/db/schema";
import { sessionSummary } from "../src/session/state";
import { chatUri, sessionDOName, sessionUri } from "../src/shared/lookups";
import { failure, failureMessage, newRecord } from "./fixtures";
import { connectPeer } from "./peer";
import { readState, storedTables } from "./storage";
import type { AgentSession } from "./session";

type Target = { hostId: string; sessionId: string; channel: string };

function target(): Target {
  const sessionId = crypto.randomUUID();

  return { hostId: crypto.randomUUID(), sessionId, channel: sessionUri(sessionId) };
}

function sessionStub({ hostId, sessionId }: Target): DurableObjectStub<AgentSession> {
  return env.CONVERSATIONS.getByName(sessionDOName(hostId, sessionId));
}

function hostRPC({ hostId }: Target): HostRPC {
  return env.COORDINATORS.getByName(hostId);
}

async function catalogue(created: Target): Promise<string[]> {
  const { items } = await hostRPC(created).listSessions();

  return items.map((item) => item.resource);
}

/** Resolves after the session storage and its catalogue entry are gone. */
async function expectRemoved(created: Target): Promise<void> {
  await vi.waitFor(async () => {
    const tables = await storedTables(sessionStub(created));
    const listed = await catalogue(created);

    expect(tables).toEqual([]);
    expect(listed).toEqual([]);
  });
}

/**
 * Resets a session object, as a deploy or a crash does. Requests in flight fail. Calls on the
 * old stub keep failing, so the caller needs a new stub.
 */
async function reset(created: Target): Promise<void> {
  await runInDurableObject(sessionStub(created), (_instance, ctx) => {
    ctx.abort("Reset for the test");
  }).catch(() => null);
}

function defaultChatOf(stored: Awaited<ReturnType<typeof readState>>): string | undefined {
  return SessionStateSchema.parse(stored?.state).defaultChat;
}

async function storedRecord(created: Target): Promise<SessionRecord> {
  const record = await runInDurableObject(sessionStub(created), (_instance, ctx) =>
    new SessionDatabase(ctx.storage).orm.select().from(sessionTable).get(),
  );

  if (!record) {
    throw new Error("Missing session");
  }

  return record;
}

async function waitForLifecycle(created: Target, lifecycle: string): Promise<void> {
  await vi.waitFor(async () => {
    const stored = await readState(sessionStub(created), created.channel);

    expect(stored).toMatchObject({ state: { lifecycle } });
  });
}

it("resumes a creation after a reset without a retry from the client", async () => {
  const created = target();
  const stub = sessionStub(created);
  await stub.holdInitialization();
  const creation = failureMessage(stub.create({ channel: created.channel, provider: "test" }));

  await waitForLifecycle(created, "creating");
  expect(await catalogue(created)).toEqual([created.channel]);

  await reset(created);
  expect(await creation).toBe("Reset for the test");

  // The restart reschedules `finishCreate`, and the alarm finishes the creation.
  const restarted = sessionStub(created);
  await runDurableObjectAlarm(restarted);
  await waitForLifecycle(created, "ready");
  expect(await catalogue(created)).toEqual([created.channel]);
  await restarted.dispose();
});

it("joins a retried create to the creation that a reset interrupted", async () => {
  const created = target();
  const stub = sessionStub(created);
  const peer = await connectPeer(created.hostId);
  await stub.holdInitialization();

  try {
    const first = failureMessage(peer.request("createSession", { channel: created.channel }));
    await waitForLifecycle(created, "creating");
    const before = await readState(stub, created.channel);

    await reset(created);
    expect(await first).toBe("Reset for the test");
    await peer.request("createSession", { channel: created.channel });

    const after = await readState(sessionStub(created), created.channel);
    expect(after).toMatchObject({ state: { lifecycle: "ready" } });

    // The retry joins the first creation, so the session keeps its default chat.
    expect(defaultChatOf(after)).toBe(defaultChatOf(before));
    expect(await catalogue(created)).toEqual([created.channel]);
  } finally {
    await sessionStub(created).dispose();
    peer.close();
  }
});

it("fails a creation after the last finishCreate attempt and removes it everywhere", async () => {
  const created = target();
  const stub = sessionStub(created);
  await stub.useFastLifecycle();
  await stub.failConnections("Agent is not reachable");

  const creation = await failure(stub.create({ channel: created.channel, provider: "test" }));
  expect(creation).toMatchObject({ message: "Agent is not reachable" });
  expect(creation).not.toMatchObject({ code: AHPErrorCodes.SessionNotFound });

  await expectRemoved(created);
});

it("fails a creation at once when the catalogue has another session with the ID", async () => {
  const created = target();
  const stranger = newRecord({ sessionId: created.sessionId });

  const entry = {
    sessionId: created.sessionId,
    defaultChat: stranger.chatState.resource,
    revision: 0,
    summary: sessionSummary(stranger),
  };

  await hostRPC(created).sessionCreated(entry);

  const stub = sessionStub(created);
  const creation = await failure(stub.create({ channel: created.channel, provider: "test" }));

  expect(creation).toMatchObject({ code: AHPErrorCodes.SessionAlreadyExists });
  expect(await storedTables(stub)).toEqual([]);

  // The fenced removal leaves the entry of the other session.
  expect(await catalogue(created)).toEqual([created.channel]);
});

it("completes a dispose after the host acknowledges it late", async () => {
  const created = target();
  const stub = sessionStub(created);
  const host = env.COORDINATORS.getByName(created.hostId);
  await stub.useFastLifecycle();
  await stub.create({ channel: created.channel, provider: "test" });
  await host.failRemovals(true);

  try {
    const disposed = await failureMessage(stub.dispose());
    expect(disposed).toBe("Host is not available");

    // The dispose committed. The session rejects requests, but the catalogue still lists it.
    const subscribing = stub.subscribe({ router: crypto.randomUUID(), channel: created.channel });
    expect(await failureMessage(subscribing)).toBe("Session does not exist");
    expect(await catalogue(created)).toEqual([created.channel]);
  } finally {
    await host.failRemovals(false);
  }

  await expectRemoved(created);

  const session: SessionRPC = stub;
  const disposedAgain = await failure(session.dispose());
  expect(disposedAgain).toMatchObject({ code: AHPErrorCodes.SessionNotFound });
});

it("completes a dispose after a reset", async () => {
  const created = target();
  const host = env.COORDINATORS.getByName(created.hostId);
  await sessionStub(created).create({ channel: created.channel, provider: "test" });
  await host.failRemovals(true);

  try {
    const disposed = await failureMessage(sessionStub(created).dispose());
    expect(disposed).toBe("Host is not available");
    await reset(created);
  } finally {
    await host.failRemovals(false);
  }

  // The restart schedules `finishDispose` at once.
  await runDurableObjectAlarm(sessionStub(created));
  await expectRemoved(created);
});

it("removes the catalogue entry when a dispose starts during sessionCreated", async () => {
  const created = target();
  const stub = sessionStub(created);
  const host = env.COORDINATORS.getByName(created.hostId);
  await host.holdCreates();

  const creation = failure(stub.create({ channel: created.channel, provider: "test" }));
  await waitForLifecycle(created, "creating");
  const disposal = failure(stub.dispose());
  await host.releaseCreates();

  expect(await creation).toMatchObject({ code: AHPErrorCodes.SessionNotFound });
  expect(await disposal).toBeNull();
  await expectRemoved(created);
});

it("does not join a new creation to a stopped creation of the same session ID", async () => {
  const created = target();
  const stub = sessionStub(created);
  await stub.holdNextConnection();

  const first = failure(stub.create({ channel: created.channel, provider: "test" }));
  await waitForLifecycle(created, "creating");
  const firstChat = defaultChatOf(await readState(stub, created.channel));
  await stub.dispose();

  // The first creation still waits in `connectAgent`.
  await stub.create({ channel: created.channel, provider: "test" });
  await stub.releaseConnection();

  expect(await first).toMatchObject({ code: AHPErrorCodes.SessionNotFound });

  const stored = await readState(stub, created.channel);
  expect(stored).toMatchObject({ state: { lifecycle: "ready" } });
  expect(defaultChatOf(stored)).not.toBe(firstChat);
  expect(await catalogue(created)).toEqual([created.channel]);
  await stub.dispose();
});

it("does not give a recreated session the connection of a dispose that waits for the agent", async () => {
  const created = target();
  const stub = sessionStub(created);
  await stub.useFastLifecycle();
  await stub.create({ channel: created.channel, provider: "test" });
  const first = await storedRecord(created);

  // The cancellation of the dispose cannot reach the agent, so `finishDispose` deletes the session.
  await stub.holdAgentWrites();
  const disposal = failure(stub.dispose());
  await expectRemoved(created);
  expect(await disposal).toBeNull();
  expect(await stub.streamCounts()).toEqual({ total: 1, open: 0 });

  await stub.create({ channel: created.channel, provider: "test" });
  const second = await storedRecord(created);
  expect(second.acpSessionId).not.toBe(first.acpSessionId);

  // The held cancellation reaches the old agent late and does not close the new connection.
  await stub.releaseAgentWrites();
  await vi.waitFor(async () => {
    expect(await stub.cancellationCount()).toBe(1);
  });
  expect(await stub.streamCounts()).toEqual({ total: 2, open: 1 });
  await stub.dispose();
});

it("retries a creation when the agent connection does not open before the attempt timeout", async () => {
  const created = target();
  const stub = sessionStub(created);
  await stub.useFastLifecycle({ createAttemptTimeoutMs: 100, createAttempts: 3 });
  await stub.holdNextConnection();

  // The timeout of the first `finishCreate` attempt stops the creation that the create started.
  const creation = await failureMessage(
    stub.create({ channel: created.channel, provider: "test" }),
  );

  expect(creation).toBe("Agent connection was closed");

  await waitForLifecycle(created, "ready");
  const { creationAttempts } = await storedRecord(created);
  const timedOutAttempts = 1;
  expect(creationAttempts).toBe(timedOutAttempts + 1);

  // The held connection opens late. The session closes it and keeps the connection of the retry.
  await stub.releaseConnection();
  await vi.waitFor(async () => {
    expect(await stub.streamCounts()).toEqual({ total: 2, open: 1 });
  });
  await stub.dispose();
});

it("sends the summary again after a reset when the host has an older one", async () => {
  const created = target();
  await sessionStub(created).create({ channel: created.channel, provider: "test" });

  // A crash after the change and before the sync leaves the host with the older summary.
  await runInDurableObject(sessionStub(created), (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);
    const record = db.orm.select().from(sessionTable).get();

    if (!record) {
      throw new Error("Missing session");
    }

    record.sessionState.title = "Renamed";
    record.revision += 1;
    db.orm.update(sessionTable).set(record).where(eq(sessionTable.id, record.id)).run();
  });

  await reset(created);
  await readState(sessionStub(created), created.channel);

  await vi.waitFor(async () => {
    const { items } = await hostRPC(created).listSessions();

    expect(items).toMatchObject([{ title: "Renamed" }]);
  });

  await sessionStub(created).dispose();
});

it("deletes storage without a record after a reset", async () => {
  const created = target();

  await runInDurableObject(sessionStub(created), async (_instance, ctx) => {
    await new SessionDatabase(ctx.storage).migrate();
  });

  await reset(created);

  const restarted = sessionStub(created);
  const disposed = await failure(restarted.dispose());

  expect(disposed).toMatchObject({ code: AHPErrorCodes.SessionNotFound });
  expect(await storedTables(restarted)).toEqual([]);
});

it("removes a catalogue entry that has no session and rejects an unknown session", async () => {
  const orphan = target();
  const peer = await connectPeer(orphan.hostId);
  const record = newRecord({ sessionId: orphan.sessionId });
  const defaultChat = chatUri(orphan.sessionId, crypto.randomUUID());
  const summary = sessionSummary(record);

  try {
    await hostRPC(orphan).sessionCreated({
      sessionId: orphan.sessionId,
      defaultChat,
      revision: 0,
      summary,
    });
    expect(await catalogue(orphan)).toEqual([orphan.channel]);

    await peer.request("disposeSession", { channel: orphan.channel });
    expect(await catalogue(orphan)).toEqual([]);

    await expect(peer.request("disposeSession", { channel: orphan.channel })).rejects.toThrow(
      "Session does not exist",
    );
  } finally {
    peer.close();
  }
});
