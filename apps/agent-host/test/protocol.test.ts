import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { InitializeResultSchema, ReconnectResultSchema } from "@experiments/protocol-schemas/ahp";
import { expect, it, vi } from "vitest";
import { ConnectionSchema } from "../src/ahp/protocol";
import { HostStore } from "../src/state/store";
import { Peer } from "./peer";
import { createSession } from "./config";

const ROOT = "ahp-root://";

const SESSION = "ahp-session:/protocol-test";

const SECOND_SEQUENCE = 2;

const LAST_ACTION_INDEX = -1;

async function openPeer(stub: DurableObjectStub): Promise<Peer> {
  const response = await stub.fetch("https://host/ahp", {
    headers: { Upgrade: "websocket" },
  });

  if (!response.webSocket) {
    throw new Error("Host did not accept the WebSocket upgrade");
  }

  return new Peer(response.webSocket);
}

async function readyHost(): Promise<{
  stub: DurableObjectStub;
  chat: string;
  sequence: number;
}> {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());

  const state = await runInDurableObject(stub, (instance, ctx) => {
    expect(instance).toBeDefined();
    const store = new HostStore(ctx);
    createSession(store, SESSION, "protocol-generation");
    store.apply(SESSION, { type: "session/ready" });

    return { chat: store.require(SESSION).chatUri, sequence: store.sequence };
  });

  return { stub, ...state };
}

it.each([true, false])(
  "initializes with missing subscriptions and available channels: %s",
  async (includeAvailable) => {
    const { stub, chat } = await readyHost();
    const peer = await openPeer(stub);
    const available = includeAvailable ? [ROOT, SESSION, chat] : [];
    const missing = "ahp-session:/not-created";

    try {
      const result = InitializeResultSchema.parse(
        await peer.request("initialize", {
          channel: ROOT,
          clientId: "initial-client",
          protocolVersions: [PROTOCOL_VERSION],
          initialSubscriptions: [missing, ...available, `${missing}/chat`],
        }),
      );

      expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(result.snapshots.map((snapshot) => snapshot.resource)).toEqual(available);
      await runInDurableObject(stub, (instance, ctx) => {
        expect(instance).toBeDefined();
        expect(ctx.getWebSockets()).toHaveLength(1);

        for (const socket of ctx.getWebSockets()) {
          const connection = ConnectionSchema.parse(socket.deserializeAttachment());

          expect(connection).toEqual({
            phase: "ready",
            clientId: "initial-client",
            subscriptions: available,
          });
        }
      });
      expect(await peer.request("listSessions", { channel: ROOT })).toMatchObject({
        items: [{ resource: SESSION }],
      });
      await expect(peer.request("subscribe", { channel: missing })).rejects.toThrow(
        "Session does not exist",
      );
    } finally {
      peer.close();
    }
  },
);

it.each(["replay", "snapshot"])(
  "reconnects an initialized connection through %s and replaces subscriptions",
  async (recovery) => {
    const { stub, chat, sequence } = await readyHost();
    const peer = await openPeer(stub);
    const missing = "ahp-session:/missing";

    try {
      await peer.request("initialize", {
        channel: ROOT,
        clientId: "resume-client",
        protocolVersions: [PROTOCOL_VERSION],
        initialSubscriptions: [ROOT, chat],
      });
      await runInDurableObject(stub, (instance, ctx) => {
        expect(instance).toBeDefined();
        new HostStore(ctx).apply(SESSION, {
          type: "session/titleChanged",
          title: "Before reconnect",
        });
      });

      const result = ReconnectResultSchema.parse(
        await peer.request("reconnect", {
          channel: ROOT,
          clientId: "resume-client",
          lastSeenServerSeq: recovery === "replay" ? sequence : sequence + SECOND_SEQUENCE,
          subscriptions: [SESSION, missing],
        }),
      );

      const expected =
        recovery === "replay"
          ? {
              type: "replay",
              missing: [missing],
              actions: [
                {
                  channel: SESSION,
                  action: {
                    type: "session/titleChanged",
                    title: "Before reconnect",
                  },
                },
              ],
            }
          : {
              type: "snapshot",
              snapshots: [{ resource: SESSION, state: { title: "Before reconnect" } }],
            };

      expect(result).toMatchObject(expected);

      await runInDurableObject(stub, (instance, ctx) => {
        expect(instance).toBeDefined();

        for (const socket of ctx.getWebSockets()) {
          const connection = ConnectionSchema.parse(socket.deserializeAttachment());

          expect(connection).toEqual({
            phase: "ready",
            clientId: "resume-client",
            subscriptions: [SESSION],
          });
        }
      });
      peer.notify("dispatchAction", {
        channel: SESSION,
        clientSeq: 1,
        action: { type: "session/titleChanged", title: "After reconnect" },
      });
      await vi.waitFor(() => {
        expect(peer.actions).toMatchObject([
          {
            channel: SESSION,
            action: { type: "session/titleChanged", title: "After reconnect" },
            origin: { clientId: "resume-client", clientSeq: 1 },
          },
        ]);
      });
    } finally {
      peer.close();
    }
  },
);

it("delivers duplicate acknowledgements only to their origin and removes disposed subscriptions", async () => {
  const { stub, chat } = await readyHost();
  const sender = await openPeer(stub);
  const observer = await openPeer(stub);

  try {
    await sender.request("initialize", {
      channel: ROOT,
      clientId: "sender",
      protocolVersions: [PROTOCOL_VERSION],
      initialSubscriptions: [SESSION, chat],
    });
    await observer.request("initialize", {
      channel: ROOT,
      clientId: "observer",
      protocolVersions: [PROTOCOL_VERSION],
      initialSubscriptions: [SESSION],
    });

    const params = {
      channel: SESSION,
      clientSeq: 1,
      action: { type: "session/titleChanged", title: "Renamed" },
    };

    sender.notify("dispatchAction", params);
    await vi.waitFor(() => {
      expect(sender.actions).toHaveLength(1);
      expect(observer.actions).toEqual(sender.actions);
    });
    const [accepted] = sender.actions;
    sender.notify("dispatchAction", params);
    await vi.waitFor(() => {
      expect(sender.actions).toHaveLength(SECOND_SEQUENCE);
    });
    expect(sender.actions[1]).toEqual(accepted);
    expect(observer.actions).toHaveLength(1);
    sender.notify("dispatchAction", {
      ...params,
      action: { type: "session/titleChanged", title: "Reused sequence" },
    });
    await vi.waitFor(() => {
      expect(sender.actions.at(LAST_ACTION_INDEX)?.rejectionReason).toBe(
        "Client sequence was reused for another action",
      );
    });
    await runInDurableObject(stub, (instance, ctx) => {
      expect(instance).toBeDefined();
      const store = new HostStore(ctx);
      expect(store.sequence).toBe(accepted?.serverSeq);
      expect(store.require(SESSION).session.title).toBe("Renamed");
    });
    observer.notify("unsubscribe", { channel: SESSION });
    await observer.request("ping", { channel: ROOT });
    sender.notify("dispatchAction", {
      ...params,
      clientSeq: SECOND_SEQUENCE,
      action: { type: "session/titleChanged", title: "After unsubscribe" },
    });
    await vi.waitFor(() => {
      expect(sender.actions.at(LAST_ACTION_INDEX)?.action).toEqual({
        type: "session/titleChanged",
        title: "After unsubscribe",
      });
    });
    await observer.request("ping", { channel: ROOT });
    expect(observer.actions).toHaveLength(1);
    await sender.request("disposeSession", { channel: SESSION });
    await runInDurableObject(stub, (instance, ctx) => {
      expect(instance).toBeDefined();

      for (const socket of ctx.getWebSockets()) {
        const connection = ConnectionSchema.parse(socket.deserializeAttachment());

        expect(connection).toMatchObject({ phase: "ready", subscriptions: [] });
      }

      expect(new HostStore(ctx).lookup(SESSION)).toBeNull();
    });
    await expect(sender.request("subscribe", { channel: chat })).rejects.toThrow(
      "Session does not exist",
    );
  } finally {
    sender.close();
    observer.close();
  }
});

it("routes reconnect through replay or snapshots and enforces the connection phase", async () => {
  const { stub, chat, sequence } = await readyHost();
  await runInDurableObject(stub, (instance, ctx) => {
    expect(instance).toBeDefined();
    new HostStore(ctx).apply(SESSION, {
      type: "session/titleChanged",
      title: "While disconnected",
    });
  });
  const replay = await openPeer(stub);
  const snapshot = await openPeer(stub);

  try {
    expect(await replay.request("ping", { channel: ROOT })).toBeNull();
    await expect(replay.request("listSessions", { channel: ROOT })).rejects.toThrow(
      "Initialize the connection first",
    );
    const missing = "ahp-session:/missing";
    expect(
      await replay.request("reconnect", {
        channel: ROOT,
        clientId: "replay-client",
        lastSeenServerSeq: sequence,
        subscriptions: [SESSION, chat, missing],
      }),
    ).toMatchObject({
      type: "replay",
      actions: [{ channel: SESSION, action: { type: "session/titleChanged" } }],
      missing: [missing],
    });
    await expect(
      replay.request("initialize", {
        channel: ROOT,
        clientId: "replay-client",
        protocolVersions: [PROTOCOL_VERSION],
      }),
    ).rejects.toThrow("Connection is already initialized");
    expect(
      await snapshot.request("reconnect", {
        channel: ROOT,
        clientId: "snapshot-client",
        lastSeenServerSeq: sequence + SECOND_SEQUENCE,
        subscriptions: [SESSION, chat],
      }),
    ).toMatchObject({
      type: "snapshot",
      snapshots: [
        { resource: SESSION, state: { title: "While disconnected" } },
        { resource: chat, state: { turns: [] } },
      ],
    });
  } finally {
    replay.close();
    snapshot.close();
  }
});
