import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import {
  InitializeResultSchema,
  ReconnectResultSchema,
  type DispatchActionParams,
  type Message,
  type StateAction,
} from "@experiments/protocol-schemas/ahp";
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

it("accepts draft and activity updates, clears them, and projects activity into the session", async () => {
  const { stub, chat } = await readyHost();
  const sender = await openPeer(stub);
  const observer = await openPeer(stub);
  const draft = { text: "Drafting", origin: { kind: "user" } } satisfies Message;

  const actions: StateAction[] = [
    { type: "chat/draftChanged", draft },
    { type: "chat/draftChanged" },
    { type: "chat/activityChanged", activity: "Thinking" },
    { type: "chat/activityChanged" },
  ];

  try {
    await Promise.all(
      (
        [
          [sender, "sender"],
          [observer, "observer"],
        ] satisfies [Peer, string][]
      ).map(([peer, clientId]) =>
        peer.request("initialize", {
          channel: ROOT,
          clientId,
          protocolVersions: [PROTOCOL_VERSION],
          initialSubscriptions: [SESSION, chat],
        }),
      ),
    );

    for (const [index, action] of actions.entries()) {
      const clientSeq = index + 1;
      sender.notify("dispatchAction", { channel: chat, clientSeq, action });
      // eslint-disable-next-line no-await-in-loop -- Observe each action before dispatching the next.
      await vi.waitFor(() => {
        const echoes = sender.actions.filter((envelope) => envelope.channel === chat);
        expect(echoes).toHaveLength(clientSeq);
        expect(echoes.at(LAST_ACTION_INDEX)).toMatchObject({
          channel: chat,
          action,
          origin: { clientId: "sender", clientSeq },
        });
        expect(echoes.at(LAST_ACTION_INDEX)?.rejectionReason).toBeUndefined();
        expect(observer.actions).toEqual(sender.actions);
      });
      // eslint-disable-next-line no-await-in-loop -- Check persisted state before the next action changes it.
      await runInDurableObject(stub, (instance, ctx) => {
        expect(instance).toBeDefined();
        const record = new HostStore(ctx).require(SESSION);
        const expectedDraft = action.type === "chat/draftChanged" ? action.draft : void 0;
        const expectedActivity = action.type === "chat/activityChanged" ? action.activity : void 0;

        expect(record.chat.draft).toEqual(expectedDraft);
        expect(record.chat.activity).toBe(expectedActivity);
        expect(record.session.chats[0]?.activity).toBe(expectedActivity);
        expect(record.chat.activeTurn).toBeUndefined();
      });
    }
  } finally {
    sender.close();
    observer.close();
  }
});

it.each(["session", "chat"])(
  "stops action delivery to an unsubscribed %s sender and resumes after subscribing",
  async (family) => {
    const { stub, chat } = await readyHost();
    const sender = await openPeer(stub);
    const observer = await openPeer(stub);
    const channel = family === "session" ? SESSION : chat;

    const action: StateAction =
      family === "session"
        ? { type: "session/titleChanged", title: "Before unsubscribe" }
        : { type: "chat/activityChanged", activity: "Before unsubscribe" };

    const params: DispatchActionParams = { channel, clientSeq: 1, action };

    const nextAction: StateAction =
      family === "session"
        ? { type: "session/titleChanged", title: "After unsubscribe" }
        : { type: "chat/activityChanged", activity: "After unsubscribe" };

    try {
      await Promise.all(
        (
          [
            [sender, "sender"],
            [observer, "observer"],
          ] satisfies [Peer, string][]
        ).map(([peer, clientId]) =>
          peer.request("initialize", {
            channel: ROOT,
            clientId,
            protocolVersions: [PROTOCOL_VERSION],
            initialSubscriptions: [SESSION, chat],
          }),
        ),
      );

      sender.notify("dispatchAction", params);
      await vi.waitFor(() => {
        expect(sender.actions.filter((envelope) => envelope.channel === channel)).toHaveLength(1);
        expect(observer.actions).toEqual(sender.actions);
      });
      const [accepted] = sender.actions;
      const before = sender.actions.filter((envelope) => envelope.channel === channel);
      sender.notify("unsubscribe", { channel });
      sender.notify("unsubscribe", { channel });
      await sender.request("ping", { channel: ROOT });

      sender.notify("dispatchAction", params);
      sender.notify("dispatchAction", { ...params, action: nextAction });
      sender.notify("dispatchAction", {
        channel,
        clientSeq: SECOND_SEQUENCE,
        action:
          family === "session"
            ? { type: "chat/activityChanged", activity: "Wrong channel" }
            : { type: "session/titleChanged", title: "Wrong channel" },
      });
      sender.notify("dispatchAction", {
        channel,
        clientSeq: SECOND_SEQUENCE + 1,
        action: nextAction,
      });
      await sender.request("ping", { channel: ROOT });
      await vi.waitFor(() => {
        expect(observer.actions.filter((envelope) => envelope.channel === channel)).toHaveLength(
          SECOND_SEQUENCE,
        );
      });
      expect(sender.actions.filter((envelope) => envelope.channel === channel)).toEqual(before);
      await runInDurableObject(stub, (instance, ctx) => {
        expect(instance).toBeDefined();
        const record = new HostStore(ctx).require(SESSION);
        expect(family === "session" ? record.session.title : record.chat.activity).toBe(
          "After unsubscribe",
        );
      });

      await sender.request("subscribe", { channel });
      sender.notify("dispatchAction", params);
      await vi.waitFor(() => {
        expect(sender.actions.filter((envelope) => envelope.channel === channel)).toHaveLength(
          SECOND_SEQUENCE,
        );
      });
      expect(sender.actions.at(LAST_ACTION_INDEX)).toEqual(accepted);
      expect(observer.actions.filter((envelope) => envelope.channel === channel)).toHaveLength(
        SECOND_SEQUENCE,
      );
    } finally {
      sender.close();
      observer.close();
    }
  },
);

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
