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
import { DEFAULT_ROUTER_DURABILITY_POLICY } from "../src/router/dependencies/router-durability";
import type { AgentHostConnectionRouter } from "./router";
import { connectPeerAt } from "./peer";
import { subscribedRouters, waitForRouterCleanup } from "./storage";

/**
 * A host that holds each root subscription until the test releases it. It records the root
 * unsubscribes and the router closes. A close attempt fails if `failsClose` returns true for
 * its attempt number. Else, it waits until the test resolves `closeReleased` if `stallsClose`
 * returns true. Attempt numbers start at 1.
 */
class HeldHost {
  readonly started = Promise.withResolvers<null>();
  readonly released = Promise.withResolvers<null>();
  readonly closeReleased = Promise.withResolvers<null>();
  readonly listStarted = Promise.withResolvers<null>();
  readonly listReleased = Promise.withResolvers<null>();
  readonly unsubscribed: string[] = [];
  subscriptions = 0;
  revision = 0;
  closeAttempts = 0;
  closes = 0;
  failsClose = (_attempt: number): boolean => false;
  stallsClose = (_attempt: number): boolean => false;

  async subscribeRoot(): Promise<HostSubscribeRootResponse> {
    this.subscriptions += 1;
    this.started.resolve(null);
    await this.released.promise;

    return { revision: this.revision, state: { agents: [], activeSessions: this.revision } };
  }

  /** Waits until the test resolves `listReleased`. */
  async listSessions(): Promise<{ items: [] }> {
    this.listStarted.resolve(null);
    await this.listReleased.promise;

    return { items: [] };
  }

  async unsubscribeRoot(): Promise<void> {
    this.unsubscribed.push(ROOT_CHANNEL);
    await Promise.resolve();
  }

  async routerClosed(): Promise<void> {
    this.closeAttempts += 1;
    const attempt = this.closeAttempts;

    if (this.failsClose(attempt)) {
      throw new Error("Close failed");
    }

    if (this.stallsClose(attempt)) {
      await this.closeReleased.promise;
    }

    this.closes += 1;
  }
}

/** Returns a host that answers subscriptions at once and fails its first `failures` closes. */
function failingHost(failures: number): HeldHost {
  const host = new HeldHost();
  host.released.resolve(null);
  host.failsClose = (attempt): boolean => attempt <= failures;

  return host;
}

/** Returns an error that `callDoRpc` retries. */
function retryableError(): Error {
  return Object.assign(new Error("Host is busy"), { retryable: true });
}

/** Allows cleanup to wait for another wake-up if the first finds a retry pending. */
const RETRY_CLEANUP_TIMEOUT_MS = 10_000;

/** A short attempt timeout, so a stalled close times out during the test. */
const STALLED_ATTEMPT_TIMEOUT_MS = 50;

/** The close of the connection and the close of a subscription that a sender accepts after it. */
const CLOSES_WITH_LATE_SUBSCRIPTION = 2;

/** The attempts of a durable call that fails once. */
const ATTEMPTS_WITH_ONE_RETRY = 2;

/** Longer than the delay of the wake-up alarm, which deletes storage after a close. */
const PAST_WAKE_UP_MS = 3000;

/** Allows the test to wait `PAST_WAKE_UP_MS` and then wait for cleanup. */
const SLOW_FRAME_TIMEOUT_MS = 15_000;

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

it(
  "retries the close of a subscription that its sender accepts after the connection closes",
  { timeout: RETRY_CLEANUP_TIMEOUT_MS },
  async () => {
    const stub = routerStub();
    const host = new HeldHost();
    // The last attempt before the retry fails. It belongs to either of the two closes.
    host.failsClose = (attempt): boolean => attempt === CLOSES_WITH_LATE_SUBSCRIPTION;

    await runInDurableObject(stub, async (router, ctx) => {
      useHost(router, host);
      const socket = await connect(router, ctx);

      const running = router.webSocketMessage(socket, initialize("first"));
      await host.started.promise;
      await router.webSocketClose(socket);
      host.released.resolve(null);
      await running;
    });

    // The close and the stopped subscription each close the router at the host.
    await waitForRouterCleanup(stub);
    expect(host.closes).toBe(CLOSES_WITH_LATE_SUBSCRIPTION);
    expect(host.closeAttempts).toBe(CLOSES_WITH_LATE_SUBSCRIPTION + 1);
    expect(host.unsubscribed).toEqual([]);
  },
);

it(
  "keeps the router storage until a frame that started before the close finishes",
  { timeout: SLOW_FRAME_TIMEOUT_MS },
  async () => {
    const stub = routerStub();
    const host = new HeldHost();

    await runInDurableObject(stub, async (router, ctx) => {
      useHost(router, host);
      const socket = await connect(router, ctx);

      const running = router.webSocketMessage(socket, initialize("first"));
      await host.started.promise;
      await router.webSocketClose(socket);
      // The wake-up alarm fires while the subscription waits.
      await scheduler.wait(PAST_WAKE_UP_MS);
      host.released.resolve(null);
      await running;
    });

    await waitForRouterCleanup(stub);
    expect(host.closes).toBe(CLOSES_WITH_LATE_SUBSCRIPTION);
  },
);

it("deletes the router storage while a frame that is not a subscription still runs", async () => {
  const stub = routerStub();
  const host = failingHost(0);

  await runInDurableObject(stub, async (router, ctx) => {
    useHost(router, host);
    const socket = await connect(router, ctx);
    await router.webSocketMessage(socket, initialize("first"));

    const list = JSON.stringify({
      jsonrpc: "2.0",
      id: "list",
      method: "listSessions",
      params: { channel: ROOT_CHANNEL },
    });

    // The frame continues after this callback returns.
    void router.webSocketMessage(socket, list);
    await host.listStarted.promise;
    await router.webSocketClose(socket);
  });

  await waitForRouterCleanup(stub);
  expect(host.closes).toBe(1);
  host.listReleased.resolve(null);
});

it("does not retry a subscription after the connection closes", async () => {
  const stub = routerStub();
  const host = new HeldHost();

  await runInDurableObject(stub, async (router, ctx) => {
    useHost(router, host);
    const socket = await connect(router, ctx);

    const running = router.webSocketMessage(socket, initialize("first"));
    await host.started.promise;
    await router.webSocketClose(socket);
    host.released.reject(retryableError());
    await running;
  });

  await waitForRouterCleanup(stub);
  expect(host.subscriptions).toBe(1);
  expect(host.closes).toBe(1);
});

it(
  "retries the close of a router, then deletes the router storage",
  { timeout: RETRY_CLEANUP_TIMEOUT_MS },
  async () => {
    const stub = routerStub();
    const host = failingHost(1);

    await runInDurableObject(stub, async (router, ctx) => {
      useHost(router, host);
      const socket = await connect(router, ctx);
      await router.webSocketMessage(socket, initialize("first"));
      await router.webSocketClose(socket);
    });

    await waitForRouterCleanup(stub);
    expect(host.closeAttempts).toBe(ATTEMPTS_WITH_ONE_RETRY);
    expect(host.closes).toBe(1);
  },
);

it(
  "retries a close that stalls past its attempt timeout",
  { timeout: RETRY_CLEANUP_TIMEOUT_MS },
  async () => {
    const stub = routerStub();
    const host = failingHost(0);
    host.stallsClose = (attempt): boolean => attempt === 1;

    await runInDurableObject(stub, async (router, ctx) => {
      router.useDurabilityPolicy({
        ...DEFAULT_ROUTER_DURABILITY_POLICY,
        unsubscribeAttemptTimeoutMs: STALLED_ATTEMPT_TIMEOUT_MS,
      });
      useHost(router, host);
      const socket = await connect(router, ctx);
      await router.webSocketMessage(socket, initialize("first"));
      await router.webSocketClose(socket);
    });

    // The first close still waits. The retry after its timeout completes the close.
    await waitForRouterCleanup(stub);
    expect(host.closeAttempts).toBe(ATTEMPTS_WITH_ONE_RETRY);
    expect(host.closes).toBe(1);
    host.closeReleased.resolve(null);
  },
);

it(
  "deletes the router storage after a restart interrupts the unsubscribe of a close",
  {
    // The first wake-up after the restart can find the retry still pending.
    timeout: RETRY_CLEANUP_TIMEOUT_MS,
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
      expect(host.closeAttempts).toBeGreaterThan(0);
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

    // The close and the stopped subscription each close the router at the host.
    await vi.waitFor(() => {
      expect(host.closes).toBe(CLOSES_WITH_LATE_SUBSCRIPTION);
    });

    return overflow;
  });

  expect(result).toEqual({ subscribed: [] });
  await waitForRouterCleanup(stub);
});
