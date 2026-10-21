import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { PROTOCOL_VERSION as AHP_PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { RouterDatabase } from "../src/router/db/database";
import type { HostSubscribeRootResponse } from "../src/shared/rpc/host";
import { newRouterDOName } from "../src/shared/lookups";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import { MAX_HELD_PUSHES } from "../src/router/services/subscriptions";
import { ServerSequence } from "../src/router/dependencies/server-sequence";
import type { AgentHostConnectionRouter } from "./router";
import { connectPeerAt } from "./peer";
import { subscribedRouters, waitForRouterCleanup } from "./storage";

/**
 * A host that holds each root subscription until the test releases it. Its root unsubscribe
 * fails `unsubscribeFailures` times. The next `stalledUnsubscribes` unsubscribes wait until the
 * test resolves `unsubscribeReleased`. Later unsubscribes succeed.
 */
class HeldHost {
  readonly started = Promise.withResolvers<null>();
  readonly released = Promise.withResolvers<null>();
  readonly unsubscribeReleased = Promise.withResolvers<null>();
  readonly unsubscribed: string[] = [];
  subscriptions = 0;
  revision = 0;
  unsubscribeFailures = 0;
  stalledUnsubscribes = 0;
  unsubscribeAttempts = 0;

  async subscribeRoot(): Promise<HostSubscribeRootResponse> {
    this.subscriptions += 1;
    this.started.resolve(null);
    await this.released.promise;

    return { revision: this.revision, state: { agents: [], activeSessions: this.revision } };
  }

  async unsubscribeRoot(): Promise<void> {
    this.unsubscribeAttempts += 1;

    if (this.unsubscribeAttempts <= this.unsubscribeFailures) {
      throw new Error("Unsubscribe failed");
    }

    if (this.unsubscribeAttempts <= this.unsubscribeFailures + this.stalledUnsubscribes) {
      await this.unsubscribeReleased.promise;
    }

    this.unsubscribed.push(ROOT_CHANNEL);
    await Promise.resolve();
  }
}

/** Returns a host that answers subscriptions at once and fails its first unsubscribes. */
function failingHost(unsubscribeFailures: number): HeldHost {
  const host = new HeldHost();
  host.released.resolve(null);
  host.unsubscribeFailures = unsubscribeFailures;

  return host;
}

const RESTART_CLEANUP_TIMEOUT_MS = 10_000;

/** A short attempt timeout, so a stalled unsubscribe times out during the test. */
const STALLED_ATTEMPT_TIMEOUT_MS = 50;

function routerStub(): ReturnType<typeof env.CONNECTIONS.getByName> {
  const name = newRouterDOName(crypto.randomUUID());

  return env.CONNECTIONS.getByName(name);
}

/** Replaces the host namespace of the router with one that returns `host`. */
function useHost(router: AgentHostConnectionRouter, host: HeldHost): void {
  Object.assign(router, { host: { getByName: (): HeldHost => host } });
}

function upgrade(): Request {
  return new Request("https://router/", { headers: { Upgrade: "websocket" } });
}

/** Opens the client connection and returns the server side of its WebSocket. */
async function connect(
  router: AgentHostConnectionRouter,
  ctx: DurableObjectState,
): Promise<WebSocket> {
  await router.fetch(upgrade());
  const [socket] = ctx.getWebSockets();

  if (!socket) {
    throw new Error("The router did not accept the WebSocket");
  }

  return socket;
}

function initialize(id: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      channel: ROOT_CHANNEL,
      clientId: crypto.randomUUID(),
      protocolVersions: [AHP_PROTOCOL_VERSION],
      initialSubscriptions: [ROOT_CHANNEL],
    },
  });
}

it("does not run frames that wait behind a frame when the connection closes", async () => {
  const subscriptions = await runInDurableObject(routerStub(), async (router, ctx) => {
    const host = new HeldHost();
    useHost(router, host);
    const socket = await connect(router, ctx);

    const running = router.webSocketMessage(socket, initialize("first"));
    const queued = router.webSocketMessage(socket, initialize("second"));
    await host.started.promise;
    await router.webSocketClose(socket);
    host.released.resolve(null);
    await Promise.all([running, queued]);

    return host.subscriptions;
  });

  expect(subscriptions).toBe(1);
});

it("stops a subscription that its sender accepts after the connection closes", async () => {
  const stub = routerStub();

  await runInDurableObject(stub, async (router, ctx) => {
    const host = new HeldHost();
    useHost(router, host);
    const socket = await connect(router, ctx);

    const running = router.webSocketMessage(socket, initialize("first"));
    await host.started.promise;
    await router.webSocketClose(socket);
    host.released.resolve(null);
    await running;

    // The close and the stopped subscription each unsubscribe the root channel.
    await vi.waitFor(() => {
      expect(host.unsubscribed).toEqual([ROOT_CHANNEL, ROOT_CHANNEL]);
    });
  });

  await waitForRouterCleanup(stub);
});

it("retries the unsubscribe of a close, then deletes the router storage", async () => {
  const stub = routerStub();
  const host = failingHost(1);

  await runInDurableObject(stub, async (router, ctx) => {
    useHost(router, host);
    const socket = await connect(router, ctx);
    await router.webSocketMessage(socket, initialize("first"));
    await router.webSocketClose(socket);
  });

  await waitForRouterCleanup(stub);
  expect(host.unsubscribeAttempts).toBe(host.unsubscribeFailures + 1);
  expect(host.unsubscribed).toEqual([ROOT_CHANNEL]);
});

it("retries an unsubscribe that stalls past its attempt timeout", async () => {
  const stub = routerStub();
  const host = failingHost(0);
  host.stalledUnsubscribes = 1;

  await runInDurableObject(stub, async (router, ctx) => {
    router.useDurabilityPolicy({ unsubscribeAttemptTimeoutMs: STALLED_ATTEMPT_TIMEOUT_MS });
    useHost(router, host);
    const socket = await connect(router, ctx);
    await router.webSocketMessage(socket, initialize("first"));
    await router.webSocketClose(socket);
  });

  // The first unsubscribe still waits. The retry after its timeout completes the close.
  await waitForRouterCleanup(stub);
  expect(host.unsubscribeAttempts).toBe(host.stalledUnsubscribes + 1);
  expect(host.unsubscribed).toEqual([ROOT_CHANNEL]);
  host.unsubscribeReleased.resolve(null);
});

it(
  "deletes the router storage after a restart interrupts the unsubscribe of a close",
  {
    // The first wake-up after the restart can find the retry still pending.
    timeout: RESTART_CLEANUP_TIMEOUT_MS,
  },
  async () => {
    const hostId = crypto.randomUUID();
    const name = newRouterDOName(hostId);
    const stub = env.CONNECTIONS.getByName(name);
    const host = failingHost(Number.POSITIVE_INFINITY);

    // A WebSocket client completes the close handshake. Without it, the eviction waits.
    const peer = await connectPeerAt(name);
    await peer.request("subscribe", { channel: ROOT_CHANNEL });
    await runInDurableObject(stub, (router) => {
      useHost(router, host);
    });

    peer.close();
    await vi.waitFor(() => {
      expect(host.unsubscribeAttempts).toBeGreaterThan(0);
    });

    // After the restart, the router unsubscribes at the host of the test environment.
    await evictDurableObject(stub);
    await waitForRouterCleanup(stub);
    const coordinator = env.COORDINATORS.getByName(hostId);
    expect(await subscribedRouters(coordinator)).toEqual([]);
  },
);

it("does not open a connection again after a close", async () => {
  const rejection = await runInDurableObject(routerStub(), async (router, ctx) => {
    useHost(router, failingHost(0));
    const socket = await connect(router, ctx);
    await router.webSocketClose(socket);
    const response = await router.fetch(upgrade());

    return await response.text();
  });

  expect(rejection).toBe("Router accepts only one connection");
});

it.each([
  { success: true, revision: 0 },
  { success: true, revision: 1 },
  { success: false, revision: 0 },
])(
  "acknowledges pushes during setup with success=$success and snapshot revision=$revision",
  async ({ success, revision }) => {
    const result = await runInDurableObject(routerStub(), async (router, ctx) => {
      const host = new HeldHost();
      host.revision = revision;
      useHost(router, host);
      const socket = await connect(router, ctx);
      const running = router.webSocketMessage(socket, initialize("first"));
      await host.started.promise;

      const acknowledged = await router.rootUpdate({
        after: 0,
        updates: [
          {
            revision: 1,
            kind: "action",
            action: { type: "root/activeSessionsChanged", activeSessions: 1 },
          },
        ],
      });

      const sequence = new ServerSequence(new RouterDatabase(ctx.storage));
      const before = sequence.current();

      if (success) {
        host.released.resolve(null);
      } else {
        host.released.reject(new Error("Snapshot failed"));
      }

      await running;
      const after = sequence.current();

      const subsequent = await router.rootUpdate({
        after: 1,
        updates: [
          {
            revision: 2,
            kind: "action",
            action: { type: "root/activeSessionsChanged", activeSessions: 2 },
          },
        ],
      });

      return { acknowledged, before, after, subsequent, unsubscribed: host.unsubscribed };
    });

    expect(result).toEqual({
      acknowledged: { subscribed: [ROOT_CHANNEL] },
      before: 0,
      after: success && revision === 0 ? 1 : 0,
      subsequent: { subscribed: success ? [ROOT_CHANNEL] : [] },
      unsubscribed: [],
    });
  },
);

it("keeps an existing subscription when a replacement snapshot fails", async () => {
  const result = await runInDurableObject(routerStub(), async (router, ctx) => {
    const initial = new HeldHost();
    initial.released.resolve(null);
    useHost(router, initial);
    const socket = await connect(router, ctx);
    await router.webSocketMessage(socket, initialize("first"));

    const replacement = new HeldHost();
    useHost(router, replacement);

    const running = router.webSocketMessage(
      socket,
      JSON.stringify({
        jsonrpc: "2.0",
        id: "replacement",
        method: "subscribe",
        params: { channel: ROOT_CHANNEL },
      }),
    );

    await replacement.started.promise;

    const acknowledged = await router.rootUpdate({
      after: 0,
      updates: [
        {
          revision: 1,
          kind: "action",
          action: { type: "root/activeSessionsChanged", activeSessions: 1 },
        },
      ],
    });

    replacement.released.reject(new Error("Snapshot failed"));
    await running;

    const subsequent = await router.rootUpdate({
      after: 1,
      updates: [
        {
          revision: 2,
          kind: "action",
          action: { type: "root/activeSessionsChanged", activeSessions: 2 },
        },
      ],
    });

    return { acknowledged, subsequent, unsubscribed: replacement.unsubscribed };
  });

  expect(result).toEqual({
    acknowledged: { subscribed: [ROOT_CHANNEL] },
    subsequent: { subscribed: [ROOT_CHANNEL] },
    unsubscribed: [],
  });
});

it("closes the connection when subscription setup buffers too many pushes", async () => {
  const stub = routerStub();

  const result = await runInDurableObject(stub, async (router, ctx) => {
    const host = new HeldHost();
    useHost(router, host);
    const socket = await connect(router, ctx);
    const running = router.webSocketMessage(socket, initialize("first"));
    await host.started.promise;

    for (let after = 0; after < MAX_HELD_PUSHES; after += 1) {
      // Each call represents a batch that the sender sends after the previous acknowledgement.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const receipt = await router.rootUpdate({
        after,
        updates: [
          {
            revision: after + 1,
            kind: "action",
            action: {
              type: "root/activeSessionsChanged",
              activeSessions: after + 1,
            },
          },
        ],
      });

      expect(receipt).toEqual({ subscribed: [ROOT_CHANNEL] });
    }

    const overflow = await router.rootUpdate({ after: MAX_HELD_PUSHES, updates: [] });
    host.released.resolve(null);
    await running;

    await vi.waitFor(() => {
      expect(host.unsubscribed).toEqual([ROOT_CHANNEL, ROOT_CHANNEL]);
    });

    return overflow;
  });

  expect(result).toEqual({ subscribed: [] });
  await waitForRouterCleanup(stub);
});
