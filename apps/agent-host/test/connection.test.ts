import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { PROTOCOL_VERSION as AHP_PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { RouterDatabase } from "../src/router/db/database";
import { RouterChannels } from "../src/router/service/channels";
import { RouterConnection } from "../src/router/service/connection";
import type { FrameHandler } from "../src/router/service/connection";
import { ClientRequests } from "../src/router/service/requests";
import { Senders } from "../src/router/service/senders";
import type { ParsedChannel, SenderSnapshot } from "../src/router/service/senders";
import { channelSender, newRouterDOName } from "../src/shared/lookups";
import { ROOT_CHANNEL } from "../src/shared/protocol";

/** Senders that hold each subscription until the test releases it. */
class HeldSenders extends Senders {
  readonly started = Promise.withResolvers<null>();
  readonly released = Promise.withResolvers<null>();
  readonly unsubscribed: string[] = [];

  constructor() {
    super({
      routerName: () => "router",
      host: noHost,
      session: noHost,
    });
  }

  override async subscribe({ channel, parsed }: ParsedChannel): Promise<SenderSnapshot> {
    this.started.resolve(null);
    await this.released.promise;
    const state = { agents: [], activeSessions: 0 };

    return { channel, sender: channelSender(parsed), revision: 0, state };
  }

  override async unsubscribe(_sender: string, channels: string[]): Promise<void> {
    this.unsubscribed.push(...channels);
    await Promise.resolve();
  }
}

function routerStub(): ReturnType<typeof env.CONNECTIONS.getByName> {
  const name = newRouterDOName(crypto.randomUUID());

  return env.CONNECTIONS.getByName(name);
}

function noHost(): never {
  throw new Error("The test has no host");
}

/** Returns the server side of a new, accepted WebSocket pair. */
function serverSocket(): WebSocket {
  const { 1: server } = new WebSocketPair();
  server.accept();

  return server;
}

it("does not run frames that wait behind a frame when the connection closes", async () => {
  const handled = await runInDurableObject(routerStub(), async (_instance, ctx) => {
    const channels = new RouterChannels(new RouterDatabase(ctx.storage));
    const started = Promise.withResolvers<null>();
    const first = Promise.withResolvers<null>();
    const frames: (string | ArrayBuffer)[] = [];

    async function handleFrame(...[, raw]: Parameters<FrameHandler>): Promise<void> {
      frames.push(raw);
      started.resolve(null);
      await first.promise;
    }

    const connection = new RouterConnection({
      channels,
      senders: new HeldSenders(),
      handleFrame,
    });

    await connection.open();
    const socket = serverSocket();
    const running = connection.handleMessage(socket, "first");
    const queued = connection.handleMessage(socket, "second");
    await started.promise;
    await connection.close();
    first.resolve(null);
    await Promise.all([running, queued]);

    return frames;
  });

  expect(handled).toEqual(["first"]);
});

it("stops a subscription that its sender accepts after the connection closes", async () => {
  const result = await runInDurableObject(routerStub(), async (_instance, ctx) => {
    const channels = new RouterChannels(new RouterDatabase(ctx.storage));
    const senders = new HeldSenders();
    const requests = new ClientRequests({ channels, senders, host: noHost, session: noHost });

    const connection = new RouterConnection({
      channels,
      senders,
      handleFrame: async (socket, raw, frame): Promise<void> => {
        await requests.handleFrame(socket, raw, frame);
      },
    });

    await connection.open();

    const initialize = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        channel: ROOT_CHANNEL,
        clientId: crypto.randomUUID(),
        protocolVersions: [AHP_PROTOCOL_VERSION],
        initialSubscriptions: [ROOT_CHANNEL],
      },
    });

    const running = connection.handleMessage(serverSocket(), initialize);
    await senders.started.promise;
    await connection.close();
    senders.released.resolve(null);
    await running;

    return { unsubscribed: senders.unsubscribed, stored: channels.exists() };
  });

  expect(result).toEqual({ unsubscribed: [ROOT_CHANNEL], stored: false });
});
