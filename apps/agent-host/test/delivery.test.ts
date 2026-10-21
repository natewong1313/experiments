import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  ActionType as AHPActionType,
  PROTOCOL_VERSION as AHP_PROTOCOL_VERSION,
} from "@microsoft/agent-host-protocol";
import type { SessionAction as AHPSessionAction } from "@microsoft/agent-host-protocol";
import { HostDatabase } from "../src/host/db/database";
import { rootTable } from "../src/host/db/schema";
import { CloseCode } from "../src/router/websockets";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import { newRouterDOName, sessionDOName, sessionUri } from "../src/shared/lookups";
import { connectPeerAt, openPeerAt, createSession as createPeerSession } from "./peer";
import { subscriberRoutersTable } from "../src/shared/db/fanout-schema";
import {
  readState,
  routerSenders,
  storedTables,
  subscribedChannels,
  storeSubscriptionSetup,
  subscribedRouters,
  waitForRouterCleanup,
} from "./storage";

const MISSED = 2;
const PIPELINED = 3;

function sessionStub(
  hostId: string,
  sessionId: string,
): ReturnType<typeof env.CONVERSATIONS.getByName> {
  return env.CONVERSATIONS.getByName(sessionDOName(hostId, sessionId));
}

it("removes the subscriptions and storage of a router when its client disconnects", async () => {
  const hostId = crypto.randomUUID();
  const router = newRouterDOName(hostId);
  const peer = await connectPeerAt(router);
  const created = await createPeerSession(peer);
  await peer.request("subscribe", { channel: ROOT_CHANNEL });
  const session = sessionStub(hostId, created.sessionId);
  expect(await subscribedRouters(session)).toEqual([router]);

  peer.close();

  const routerStub = env.CONNECTIONS.getByName(router);

  const host = env.COORDINATORS.getByName(hostId);

  await vi.waitFor(async () => {
    expect(await subscribedRouters(session)).toEqual([]);
    expect(await subscribedRouters(host)).toEqual([]);
  });

  await waitForRouterCleanup(routerStub);
});

it("ignores repeated revisions and closes the connection after a gap", async () => {
  const hostId = crypto.randomUUID();
  const router = newRouterDOName(hostId);
  const peer = await connectPeerAt(router);
  const created = await createPeerSession(peer);
  const state = await readState(sessionStub(hostId, created.sessionId), created.channel);

  if (!state) {
    throw new Error("Missing session");
  }

  const stub = env.CONNECTIONS.getByName(router);
  const ready: AHPSessionAction = { type: AHPActionType.SessionReady };

  const push = {
    sessionId: created.sessionId,
    after: state.revision,
    updates: [
      {
        revision: state.revision + 1,
        actions: [{ channel: created.channel, action: ready }],
      },
    ],
  };

  const before = peer.actions.length;
  expect(await stub.sessionActions(push)).toEqual({ subscribed: [created.channel] });
  expect(await stub.sessionActions(push)).toEqual({ subscribed: [created.channel] });
  await peer.request("ping", { channel: ROOT_CHANNEL });
  expect(peer.actions.slice(before)).toEqual([
    { channel: created.channel, action: { type: "session/ready" }, serverSeq: 1 },
  ]);

  // The router has the pushed revision. Thus a later `after` value shows a missing revision.
  const gap = { sessionId: created.sessionId, after: state.revision + MISSED, updates: [] };
  expect(await stub.sessionActions(gap)).toEqual({ subscribed: [] });
  expect(await peer.closed).toBe(CloseCode.InternalError);
  expect(await stub.sessionActions(gap)).toEqual({ subscribed: [] });
  await waitForRouterCleanup(stub);
});

it("answers pushes without writing storage when a router has no connection", async () => {
  const hostId = crypto.randomUUID();
  const stub = env.CONNECTIONS.getByName(newRouterDOName(hostId));
  const sessionId = crypto.randomUUID();

  expect(await stub.sessionActions({ sessionId, after: 0, updates: [] })).toEqual({
    subscribed: [],
  });
  const removed = { revision: 1, kind: "sessionRemoved", session: sessionUri(sessionId) } as const;
  expect(await stub.rootUpdate({ after: 0, updates: [removed] })).toEqual({ subscribed: [] });
  expect(await storedTables(stub)).toEqual([]);
});

it("tells a lagging router about missed updates after a session restart", async () => {
  const hostId = crypto.randomUUID();
  const router = newRouterDOName(hostId);
  const peer = await connectPeerAt(router);
  const created = await createPeerSession(peer);
  const stub = sessionStub(hostId, created.sessionId);

  // Simulates a stored revision that the session did not push before a restart.
  await runInDurableObject(stub, (_instance, ctx) => {
    new SessionDatabase(ctx.storage).orm
      .update(sessionTable)
      .set({ revision: sql`${sessionTable.revision} + 1` })
      .where(eq(sessionTable.id, created.sessionId))
      .run();
  });
  await evictDurableObject(stub);
  await runDurableObjectAlarm(stub);

  expect(await peer.closed).toBe(CloseCode.InternalError);
  await vi.waitFor(async () => {
    expect(await subscribedRouters(stub)).toEqual([]);
  });
});

it("tells a lagging root subscriber about missed changes after a host restart", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeerAt(newRouterDOName(hostId));
  await peer.request("subscribe", { channel: ROOT_CHANNEL });
  const host = env.COORDINATORS.getByName(hostId);

  // Simulates a stored root change that the host did not push before a restart.
  await runInDurableObject(host, (_instance, ctx) => {
    new HostDatabase(ctx.storage).orm
      .insert(rootTable)
      .values({ id: 1, revision: 1 })
      .onConflictDoUpdate({
        target: rootTable.id,
        set: { revision: sql`${rootTable.revision} + 1` },
      })
      .run();
  });
  await evictDurableObject(host);
  await runDurableObjectAlarm(host);

  expect(await peer.closed).toBe(CloseCode.InternalError);
});

it("stops pushes at each sender when the client unsubscribes", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeerAt(newRouterDOName(hostId));
  const created = await createPeerSession(peer);
  const session = sessionStub(hostId, created.sessionId);
  const host = env.COORDINATORS.getByName(hostId);
  await peer.request("subscribe", { channel: created.chat });
  await peer.request("subscribe", { channel: ROOT_CHANNEL });

  // The router sends one frame at a time, so the reply to `ping` follows each unsubscribe.
  peer.notify("unsubscribe", { channel: created.chat });
  await peer.request("ping", { channel: ROOT_CHANNEL });
  expect(await subscribedChannels(session)).toEqual([created.channel]);

  peer.notify("unsubscribe", { channel: created.channel });
  peer.notify("unsubscribe", { channel: ROOT_CHANNEL });
  await peer.request("ping", { channel: ROOT_CHANNEL });
  expect(await subscribedRouters(session)).toEqual([]);
  expect(await subscribedRouters(host)).toEqual([]);
});

it("removes a disposed session from the routers that subscribe to it", async () => {
  const hostId = crypto.randomUUID();
  const router = newRouterDOName(hostId);
  const peer = await connectPeerAt(router);
  const created = await createPeerSession(peer);
  const routerStub = env.CONNECTIONS.getByName(router);
  expect(await routerSenders(routerStub)).toEqual([
    { senderType: "session", sessionId: created.sessionId },
  ]);

  await peer.request("disposeSession", { channel: created.channel });

  expect(await routerSenders(routerStub)).toEqual([]);
});

it("answers pipelined frames when a later frame disposes a session that an earlier frame subscribes to", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeerAt(newRouterDOName(hostId));
  const created = await createPeerSession(peer);
  const held = crypto.randomUUID();
  const heldStub = env.CONVERSATIONS.getByName(sessionDOName(hostId, held));
  await heldStub.holdInitialization();

  // The subscribe and dispose frames wait behind the creation of another session.
  const creating = peer.request("createSession", { channel: sessionUri(held), provider: "test" });
  const subscribing = peer.request("subscribe", { channel: created.chat });
  const disposing = peer.request("disposeSession", { channel: created.channel });
  await heldStub.releaseInitialization(true);

  await expect(Promise.all([creating, subscribing, disposing])).resolves.toHaveLength(PIPELINED);
});

it("acknowledges session pushes while another initial snapshot is pending", async () => {
  const hostId = crypto.randomUUID();
  const creator = await connectPeerAt(newRouterDOName(hostId));
  const active = await createPeerSession(creator);
  await creator.request("subscribe", { channel: active.chat });
  const held = await createPeerSession(creator);
  const heldStub = sessionStub(hostId, held.sessionId);
  const activeStub = sessionStub(hostId, active.sessionId);
  await heldStub.holdSubscribes();
  const router = newRouterDOName(hostId);
  const observer = await openPeerAt(router);

  try {
    const initializing = observer.request("initialize", {
      channel: ROOT_CHANNEL,
      clientId: crypto.randomUUID(),
      protocolVersions: [AHP_PROTOCOL_VERSION],
      initialSubscriptions: [active.chat, held.channel],
    });

    await vi.waitFor(async () => {
      expect(await heldStub.heldSubscribeCount()).toBe(1);
      const routers = await subscribedRouters(activeStub);
      expect(routers).toContain(router);
    });
    creator.notify("dispatchAction", {
      channel: active.chat,
      clientSeq: 1,
      action: {
        type: "chat/turnStarted",
        turnId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        message: { text: "stream", origin: { kind: "user" } },
      },
    });
    await vi.waitFor(() => {
      expect(creator.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
    });
    await vi.waitFor(async () => {
      const state = await readState(activeStub, active.chat);

      const delivered = await runInDurableObject(activeStub, (_instance, ctx) => {
        const db = new SessionDatabase(ctx.storage);

        return db.orm
          .select()
          .from(subscriberRoutersTable)
          .where(eq(subscriberRoutersTable.router, router))
          .get()?.deliveredRevision;
      });

      expect(delivered).toBe(state?.revision);
    });
    expect(observer.messages).toEqual([]);
    await heldStub.releaseSubscribes();
    await initializing;
    await vi.waitFor(() => {
      const expected = creator.actions
        .filter((item) => item.channel === active.chat)
        .map((item) => item.action);

      expect(observer.actions.map((item) => item.action)).toEqual(expected);
    });
  } finally {
    await heldStub.releaseSubscribes();
    creator.close();
    observer.close();
  }
});

it("closes an interrupted subscription after a router restart and removes its records", async () => {
  const hostId = crypto.randomUUID();
  const router = newRouterDOName(hostId);
  const peer = await connectPeerAt(router);
  await peer.request("subscribe", { channel: ROOT_CHANNEL });
  const stub = env.CONNECTIONS.getByName(router);
  await storeSubscriptionSetup(stub);
  await evictDurableObject(stub);

  expect(await stub.rootUpdate({ after: 0, updates: [] })).toEqual({ subscribed: [] });
  expect(await peer.closed).toBe(CloseCode.InternalError);
  await waitForRouterCleanup(stub);
  const host = env.COORDINATORS.getByName(hostId);

  expect(await subscribedRouters(host)).toEqual([]);
});
