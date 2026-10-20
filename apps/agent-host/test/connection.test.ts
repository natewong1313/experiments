import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { PROTOCOL_VERSION as AHP_PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { RouterDatabase } from "../src/router/db/database";
import type { HostSubscribeRootResponse } from "../src/shared/rpc/host";
import { newRouterDOName } from "../src/shared/lookups";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import { MAX_HELD_PUSHES } from "../src/router/services/subscriptions";
import { ServerSequence } from "../src/router/dependencies/server-sequence";
import type { AgentHostConnectionRouter } from "./router";

/** A host that holds each root subscription until the test releases it. */
class HeldHost {
  readonly started = Promise.withResolvers<null>();
  readonly released = Promise.withResolvers<null>();
  readonly unsubscribed: string[] = [];
  subscriptions = 0;
  revision = 0;

  async subscribeRoot(): Promise<HostSubscribeRootResponse> {
    this.subscriptions += 1;
    this.started.resolve(null);
    await this.released.promise;

    return { revision: this.revision, state: { agents: [], activeSessions: this.revision } };
  }

  async unsubscribeRoot(): Promise<void> {
    this.unsubscribed.push(ROOT_CHANNEL);
    await Promise.resolve();
  }
}

function routerStub(): ReturnType<typeof env.CONNECTIONS.getByName> {
  const name = newRouterDOName(crypto.randomUUID());

  return env.CONNECTIONS.getByName(name);
}

/** Replaces the host namespace of the router with one that returns `host`. */
function useHost(router: AgentHostConnectionRouter, host: HeldHost): void {
  Object.assign(router, { host: { getByName: (): HeldHost => host } });
}

/** Opens the client connection and returns the server side of its WebSocket. */
async function connect(
  router: AgentHostConnectionRouter,
  ctx: DurableObjectState,
): Promise<WebSocket> {
  const upgrade = new Request("https://router/", { headers: { Upgrade: "websocket" } });
  await router.fetch(upgrade);
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
  const result = await runInDurableObject(routerStub(), async (router, ctx) => {
    const host = new HeldHost();
    useHost(router, host);
    const socket = await connect(router, ctx);

    const running = router.webSocketMessage(socket, initialize("first"));
    await host.started.promise;
    await router.webSocketClose(socket);
    host.released.resolve(null);
    await running;

    return {
      unsubscribed: host.unsubscribed,
      stored: new RouterDatabase(ctx.storage).hasMigrated(),
    };
  });

  expect(result).toEqual({ unsubscribed: [ROOT_CHANNEL, ROOT_CHANNEL], stored: false });
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
  const result = await runInDurableObject(routerStub(), async (router, ctx) => {
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

    return {
      overflow,
      stored: new RouterDatabase(ctx.storage).hasMigrated(),
      unsubscribed: host.unsubscribed,
    };
  });

  expect(result).toEqual({
    overflow: { subscribed: [] },
    stored: false,
    unsubscribed: [ROOT_CHANNEL, ROOT_CHANNEL],
  });
});
