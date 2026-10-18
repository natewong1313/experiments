import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { ActionType as AHPActionType } from "@microsoft/agent-host-protocol";
import type { SessionAction as AHPSessionAction } from "@microsoft/agent-host-protocol";
import { HostDatabase } from "../src/host/db/database";
import { rootTable } from "../src/host/db/schema";
import { CloseCode } from "../src/router/websockets";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import { newRouterDOName, sessionDOName, sessionUri } from "../src/shared/lookups";
import { connectPeerAt, createSession as createPeerSession } from "./peer";
import {
  readState,
  routerSenders,
  storedTables,
  subscribedChannels,
  subscribedRouters,
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

  await vi.waitFor(async () => {
    expect(await subscribedRouters(session)).toEqual([]);
    expect(await storedTables(routerStub)).toEqual([]);
  });

  const host = env.COORDINATORS.getByName(hostId);
  expect(await subscribedRouters(host)).toEqual([]);
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
  expect(await storedTables(stub)).toEqual([]);
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
  expect(await routerSenders(routerStub)).toEqual([created.sessionId]);

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
