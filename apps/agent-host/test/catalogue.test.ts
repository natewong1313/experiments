import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { SessionStatus as AHPSessionStatus } from "@microsoft/agent-host-protocol";
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
