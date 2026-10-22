import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { CloseCode } from "../src/router/websockets";
import { sessionSender } from "../src/router/sender";
import { newRouterDOName, sessionDOName } from "../src/shared/lookups";
import { failureMessage } from "./fixtures";
import { connectPeerAt, createSession } from "./peer";
import type { AgentHost } from "./host";
import type { AgentSession } from "./session";
import { storeSubscriptionSetup, subscribedRouters, waitForRouterCleanup } from "./storage";

function sessionStub(hostId: string, sessionId: string): DurableObjectStub<AgentSession> {
  return env.CONVERSATIONS.getByName(sessionDOName(hostId, sessionId));
}

/** Subscribes `router` at a session as if the router sent the request. */
async function subscribeAtSession(
  stub: DurableObjectStub<AgentSession>,
  router: string,
  channel: string,
): Promise<string | null> {
  return await runInDurableObject(
    stub,
    async (session) => await failureMessage(session.subscribe({ router, channel })),
  );
}

/** Subscribes `router` to the root channel at a host as if the router sent the request. */
async function subscribeAtHost(
  stub: DurableObjectStub<AgentHost>,
  router: string,
): Promise<string | null> {
  return await runInDurableObject(
    stub,
    async (host) => await failureMessage(host.subscribeRoot({ router })),
  );
}

it("closes the router at the senders of an interrupted setup after a router restart", async () => {
  const hostId = crypto.randomUUID();
  const router = newRouterDOName(hostId);
  const peer = await connectPeerAt(router);
  const other = newRouterDOName(hostId);
  const created = await createSession(await connectPeerAt(other));
  const session = sessionStub(hostId, created.sessionId);

  // The session accepted the subscription, but a restart stopped the router before it stored it.
  expect(await subscribeAtSession(session, router, created.channel)).toBeNull();
  const stub = env.CONNECTIONS.getByName(router);
  const pending = { channel: created.channel, sender: sessionSender(created.sessionId) };
  await storeSubscriptionSetup(stub, [pending]);
  await evictDurableObject(stub);

  expect(await stub.rootUpdate({ after: 0, updates: [] })).toEqual({ subscribed: [] });
  expect(await peer.closed).toBe(CloseCode.InternalError);
  await waitForRouterCleanup(stub);
  expect(await subscribedRouters(session)).toEqual([other]);
});

it("rejects a subscribe request from a closed router", async () => {
  const hostId = crypto.randomUUID();
  const router = newRouterDOName(hostId);
  const peer = await connectPeerAt(newRouterDOName(hostId));
  const created = await createSession(peer);
  const session = sessionStub(hostId, created.sessionId);
  const host = env.COORDINATORS.getByName(hostId);

  expect(await subscribeAtHost(host, router)).toBeNull();
  expect(await subscribeAtSession(session, router, created.channel)).toBeNull();
  await host.routerClosed({ router });
  await session.routerClosed({ router });

  // A subscribe request that the router sent before its close arrives after it.
  expect(await subscribeAtHost(host, router)).toBe("Router is closed");
  expect(await subscribeAtSession(session, router, created.chat)).toBe("Router is closed");
  expect(await subscribedRouters(host)).not.toContain(router);
  expect(await subscribedRouters(session)).not.toContain(router);
});
