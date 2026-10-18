import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { PROTOCOL_VERSION as AHP_PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { RouterDatabase } from "../src/router/db/database";
import type { HostSubscribeRootResponse } from "../src/shared/rpc/host";
import { newRouterDOName } from "../src/shared/lookups";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import type { AgentHostConnectionRouter } from "./router";

/** A host that holds each root subscription until the test releases it. */
class HeldHost {
  readonly started = Promise.withResolvers<null>();
  readonly released = Promise.withResolvers<null>();
  readonly unsubscribed: string[] = [];
  subscriptions = 0;

  async subscribeRoot(): Promise<HostSubscribeRootResponse> {
    this.subscriptions += 1;
    this.started.resolve(null);
    await this.released.promise;

    return { revision: 0, state: { agents: [], activeSessions: 0 } };
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

  expect(result).toEqual({ unsubscribed: [ROOT_CHANNEL], stored: false });
});
