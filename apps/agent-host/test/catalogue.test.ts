import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  AhpErrorCodes as AHPErrorCodes,
  SessionOriginKind as AHPSessionOriginKind,
  SessionStatus as AHPSessionStatus,
} from "@microsoft/agent-host-protocol";
import type { SessionSummary as AHPSessionSummary } from "@experiments/protocol-schemas/ahp";
import type { HostRPC } from "../src";
import { sessionSummary } from "../src/session/state";
import { failure, newRecord } from "./fixtures";
import { chatUri, sessionUri } from "../src/shared/lookups";
import { HostDatabase } from "../src/host/db/database";
import { sessionsTable } from "../src/host/db/schema";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import { connectPeer, createSession } from "./peer";

const MAX_STATUS_CHANGES = 2;

it("syncs summary changes to the host and ignores old revisions and replaced sessions", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);
  const created = await createSession(peer);
  await peer.request("subscribe", { channel: ROOT_CHANNEL });
  await peer.request("subscribe", { channel: created.chat });

  peer.notify("dispatchAction", {
    channel: created.chat,
    clientSeq: 1,
    action: {
      type: "chat/turnStarted",
      turnId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      message: { text: "stream", origin: { kind: "user" } },
    },
  });

  await vi.waitFor(() => {
    expect(peer.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
  });

  const host = env.COORDINATORS.getByName(hostId);

  const entry = await vi.waitFor(async () => {
    const stored = await runInDurableObject(host, (_instance, ctx) =>
      new HostDatabase(ctx.storage).orm
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.id, created.sessionId))
        .get(),
    );

    expect(stored?.summary.workingDirectories).toEqual(["file:///"]);
    expect(stored?.summary.status).toBe(AHPSessionStatus.Idle);

    return stored;
  });

  // Deltas change only `modifiedAt`, so they add no summary syncs.
  // The turn changes the status twice, and a later sync can replace an earlier one.
  const changes = peer.notifications.filter((item) => item.method === "root/sessionSummaryChanged");
  expect(changes.length).toBeGreaterThan(0);
  expect(changes.length).toBeLessThanOrEqual(MAX_STATUS_CHANGES);

  if (!entry) {
    throw new Error("Missing catalogue entry");
  }

  const stale = { ...entry.summary, title: "Stale" };

  await host.summaryChanged({
    sessionId: created.sessionId,
    defaultChat: entry.defaultChat,
    revision: entry.revision,
    summary: stale,
  });
  await host.summaryChanged({
    sessionId: created.sessionId,
    defaultChat: `${entry.defaultChat}-replaced`,
    revision: entry.revision + 1,
    summary: stale,
  });

  const catalogue = await runInDurableObject(
    host,
    async (instance) => await instance.listSessions(),
  );

  expect(catalogue.items).toEqual([entry.summary]);
});

type Entry = { host: HostRPC; sessionId: string; defaultChat: string; summary: AHPSessionSummary };

/** Returns a host and a catalogue entry for a new session ID, without storing the entry. */
function newEntry(): Entry {
  const record = newRecord();

  return {
    host: env.COORDINATORS.getByName(crypto.randomUUID()),
    sessionId: record.id,
    defaultChat: record.chatState.resource,
    summary: sessionSummary(record),
  };
}

async function listed(host: HostRPC): Promise<AHPSessionSummary[]> {
  const { items } = await host.listSessions();

  return items;
}

it("validates summary changes and ignores sessions absent from the catalogue", async () => {
  const { host, sessionId, defaultChat, summary } = newEntry();
  const update = { sessionId, defaultChat, revision: 1, summary };

  await host.summaryChanged(update);
  expect(await listed(host)).toEqual([]);

  const invalid = await failure(host.summaryChanged({ ...update, revision: Number.NaN }));
  expect(invalid).toMatchObject({ name: "HostSummaryChangedError" });
});

it("fences catalogue entries by their default chat", async () => {
  const { host, sessionId, defaultChat, summary } = newEntry();
  const otherChat = chatUri(sessionId, crypto.randomUUID());
  const entry = { sessionId, defaultChat, revision: 0, summary };

  await host.sessionCreated(entry);

  // A repeated create of the same session changes nothing.
  await host.sessionCreated(entry);
  expect(await listed(host)).toEqual([summary]);

  const replaced = await failure(host.sessionCreated({ ...entry, defaultChat: otherChat }));
  expect(replaced).toMatchObject({
    name: "HostSessionCreatedError",
    code: AHPErrorCodes.SessionAlreadyExists,
  });

  // A removal from another creation of the session ID leaves the entry.
  expect(await host.sessionRemoved({ sessionId, defaultChat: otherChat })).toEqual({
    removed: false,
  });
  expect(await listed(host)).toEqual([summary]);
  expect(await host.sessionRemoved({ sessionId, defaultChat })).toEqual({ removed: true });

  // A late summary does not add the removed session again.
  const late = { ...summary, title: "Late" };
  await host.summaryChanged({ sessionId, defaultChat, revision: 5, summary: late });
  expect(await listed(host)).toEqual([]);
  expect(await host.orphanRemoved({ sessionId })).toEqual({ removed: false });
});

it("retains the full AHP summary through host RPC and storage", async () => {
  const { host, sessionId, defaultChat, summary: original } = newEntry();
  await host.sessionCreated({ sessionId, defaultChat, revision: 0, summary: original });

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

  await host.summaryChanged({ sessionId, defaultChat, revision: 1, summary });

  expect(await listed(host)).toEqual([summary]);
  expect(summary.resource).toBe(sessionUri(sessionId));
});
