import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { ChatStateSchema, type ReconnectParams } from "@experiments/protocol-schemas/ahp";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import { chatUri, newRouterDOName, sessionDOName, sessionUri } from "../src/shared/lookups";
import { connectPeer, createSession, initialize, openPeer, openPeerAt, reconnect } from "./peer";
import type { Peer } from "./peer";
import { subscribedRouters, waitForRouterCleanup } from "./storage";

/** A `lastSeenServerSeq` above the sequence of the old connection. */
const LAST_SEEN_SERVER_SEQ = 42;

/** The test timeout. It gives the old router time to finish its cleanup after the close. */
const CLEANUP_TIMEOUT_MS = 10_000;

const LAST = -1;

const NEGATIVE_SEQ = -1;

const invalidReconnects = [
  {
    subscriptions: ["ahp-chat:/not-a-uuid/chat"],
    lastSeenServerSeq: 0,
    message: "Channel ID must be a lowercase UUID",
  },
  { subscriptions: ["file:///workspace"], lastSeenServerSeq: 0, message: "Unsupported channel" },
  {
    subscriptions: [],
    lastSeenServerSeq: Number.MAX_SAFE_INTEGER,
    message: "No server sequence numbers remain after lastSeenServerSeq",
  },
  {
    subscriptions: [],
    lastSeenServerSeq: NEGATIVE_SEQ,
    message: "Expected a nonnegative safe integer sequence number",
  },
];

function reconnectParams(
  clientId: string,
  subscriptions: string[],
  lastSeenServerSeq = LAST_SEEN_SERVER_SEQ,
): ReconnectParams {
  return { channel: ROOT_CHANNEL, clientId, lastSeenServerSeq, subscriptions };
}

/** Dispatches a turn and returns its ID. */
function startTurn(peer: Peer, chat: string): string {
  const turnId = crypto.randomUUID();

  peer.notify("dispatchAction", {
    channel: chat,
    clientSeq: 1,
    action: {
      type: "chat/turnStarted",
      turnId,
      startedAt: new Date().toISOString(),
      message: { text: "reconnect", origin: { kind: "user" } },
    },
  });

  return turnId;
}

async function waitForTurnComplete(peer: Peer, turnId: string): Promise<void> {
  await vi.waitFor(() => {
    const completed = peer.actions.some(
      ({ action }) => action.type === "chat/turnComplete" && action.turnId === turnId,
    );

    expect(completed).toBe(true);
  });
}

it("restores the subscriptions with the state that changed while disconnected", async () => {
  const hostId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const old = await connectPeer(hostId, clientId);
  const created = await createSession(old);
  await old.request("subscribe", { channel: created.chat });
  old.close();

  // Another client runs a turn while the first client is disconnected.
  const other = await connectPeer(hostId);
  await other.request("subscribe", { channel: created.chat });
  const missedTurn = startTurn(other, created.chat);
  await waitForTurnComplete(other, missedTurn);

  const peer = await openPeer(hostId);
  const channels = [ROOT_CHANNEL, created.channel, created.chat, created.chat];
  const snapshots = await reconnect(peer, reconnectParams(clientId, channels));

  expect(snapshots.map(({ resource, fromSeq }) => ({ resource, fromSeq }))).toEqual(
    [ROOT_CHANNEL, created.channel, created.chat].map((resource) => ({
      resource,
      fromSeq: LAST_SEEN_SERVER_SEQ,
    })),
  );
  const chat = ChatStateSchema.parse(snapshots.at(LAST)?.state);
  expect(chat.turns.map((turn) => turn.id)).toEqual([missedTurn]);

  // The connection is initialized. Its actions continue after `lastSeenServerSeq`.
  await expect(peer.request("listSessions", { channel: ROOT_CHANNEL })).resolves.toMatchObject({
    items: [{ resource: created.channel }],
  });
  const turnId = startTurn(peer, created.chat);
  await waitForTurnComplete(peer, turnId);

  expect(peer.actions.map((envelope) => envelope.serverSeq)).toEqual(
    peer.actions.map((_envelope, index) => LAST_SEEN_SERVER_SEQ + 1 + index),
  );
  const started = peer.actions.find(({ action }) => action.type === "chat/turnStarted");
  expect(started?.origin).toEqual({ clientId, clientSeq: 1 });
});

it("omits the channels of missing sessions and stale chats", async () => {
  const hostId = crypto.randomUUID();
  const old = await connectPeer(hostId);
  const kept = await createSession(old);
  const disposed = await createSession(old);
  await old.request("disposeSession", { channel: disposed.channel });

  const staleChat = chatUri(kept.sessionId, crypto.randomUUID());
  const absentSession = sessionUri(crypto.randomUUID());

  const channels = [
    ROOT_CHANNEL,
    kept.channel,
    kept.chat,
    staleChat,
    disposed.channel,
    disposed.chat,
    absentSession,
  ];

  const params = reconnectParams(crypto.randomUUID(), channels);

  const peer = await openPeer(hostId);
  const snapshots = await reconnect(peer, params);

  expect(snapshots.map((snapshot) => snapshot.resource)).toEqual([
    ROOT_CHANNEL,
    kept.channel,
    kept.chat,
  ]);
  await expect(peer.request("ping", { channel: ROOT_CHANNEL })).resolves.toBeNull();
});

it.each(invalidReconnects)(
  "rejects a reconnect with the error $message and stays uninitialized",
  async ({ message, subscriptions, lastSeenServerSeq }) => {
    const peer = await openPeer(crypto.randomUUID());
    const params = reconnectParams(crypto.randomUUID(), subscriptions, lastSeenServerSeq);

    await expect(peer.request("reconnect", params)).rejects.toThrow(message);
    await expect(peer.request("listSessions", { channel: ROOT_CHANNEL })).rejects.toThrow(
      "Initialize the connection first",
    );
    await expect(initialize(peer)).resolves.toBe(peer);
  },
);

it("accepts an empty reconnect at the last sequence number and rejects a second handshake", async () => {
  const peer = await openPeer(crypto.randomUUID());
  const params = reconnectParams(crypto.randomUUID(), [], Number.MAX_SAFE_INTEGER - 1);

  await expect(reconnect(peer, params)).resolves.toEqual([]);
  await expect(peer.request("listSessions", { channel: ROOT_CHANNEL })).resolves.toEqual({
    items: [],
  });
  await expect(peer.request("reconnect", params)).rejects.toThrow(
    "Connection is already initialized",
  );
  await expect(initialize(peer)).rejects.toThrow("Connection is already initialized");
});

it(
  "keeps the subscriptions of the new router when the old router cleans up",
  { timeout: CLEANUP_TIMEOUT_MS },
  async () => {
    const hostId = crypto.randomUUID();
    const clientId = crypto.randomUUID();
    const oldRouter = newRouterDOName(hostId);
    const old = await initialize(await openPeerAt(oldRouter), clientId);
    const created = await createSession(old);
    old.close();

    const newRouter = newRouterDOName(hostId);
    const peer = await openPeerAt(newRouter);
    await reconnect(peer, reconnectParams(clientId, [created.channel]));

    await waitForRouterCleanup(env.CONNECTIONS.getByName(oldRouter));
    const session = env.CONVERSATIONS.getByName(sessionDOName(hostId, created.sessionId));
    expect(await subscribedRouters(session)).toEqual([newRouter]);
  },
);
