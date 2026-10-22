import { env } from "cloudflare:workers";
import { evictDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  ActionType as AHPActionType,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
  MessageKind as AHPMessageKind,
  ResponsePartKind as AHPResponsePartKind,
} from "@microsoft/agent-host-protocol";
import {
  ChatStateSchema,
  SubscribeResultSchema,
  type ActionEnvelope,
  type ReconnectParams,
} from "@experiments/protocol-schemas/ahp";
import { FETCH_TURNS_PAGE } from "../src/session/chat/store";
import { ROOT_CHANNEL } from "../src/shared/protocol";
import { sessionDOName } from "../src/shared/lookups";
import { connectPeer, createSession, openPeer, reconnect } from "./peer";
import type { CreatedSession, Peer } from "./peer";
import { changeSession } from "./storage";

const RECENT = 5;
const NARROW = 2;
const WIDE = 10;
const SHORT_HISTORY = 3;
const LONG_HISTORY = 20;
const LAST = -1;
// The test agent sends three deltas per turn. Turn start and completion each change the status.
const STREAM_DELTAS = 3;
const STATUS_CHANGES = 2;

/** Stores `count` ended turns in the chat of a session that has no chat subscribers. */
async function storeTurns(
  hostId: string,
  session: CreatedSession,
  count: number,
): Promise<string[]> {
  const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.sessionId));
  const turnIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    turnIds.push(`turn-${index}`);
  }

  await changeSession(stub, ({ chats }) => {
    for (const turnId of turnIds) {
      chats.apply(session.chat, {
        type: AHPActionType.ChatTurnStarted,
        turnId,
        startedAt: new Date().toISOString(),
        message: { text: turnId, origin: { kind: AHPMessageKind.User } },
      });
      chats.apply(session.chat, {
        type: AHPActionType.ChatResponsePart,
        turnId,
        part: { kind: AHPResponsePartKind.Markdown, id: turnId, content: `answer ${turnId}` },
      });
      chats.apply(session.chat, { type: AHPActionType.ChatTurnComplete, turnId, duration: 1 });
    }
  });

  return turnIds;
}

type Snapshot = { turnIds: string[]; cursor?: string };

async function subscribe(peer: Peer, chat: string, turns?: number): Promise<Snapshot> {
  const view = turns === undefined ? undefined : { turns };
  const reply = await peer.request("subscribe", { channel: chat, view });
  const result = SubscribeResultSchema.parse(reply);
  const state = ChatStateSchema.parse(result.snapshot?.state);

  return { turnIds: state.turns.map((turn) => turn.id), cursor: state.turnsNextCursor };
}

/** Returns the `chat/turnsLoaded` actions that the peer received. */
function loadedActions(
  peer: Peer,
): Extract<ActionEnvelope["action"], { type: "chat/turnsLoaded" }>[] {
  return peer.actions.flatMap(({ action }) => (action.type === "chat/turnsLoaded" ? [action] : []));
}

/** Returns the error code of the last failed request of the peer. */
function lastErrorCode(peer: Peer): number | undefined {
  const failures = peer.messages.flatMap((message) =>
    "error" in message ? [message.error.code] : [],
  );

  return failures.at(LAST);
}

it("sends the loaded turns before the fetchTurns reply and pages until no cursor remains", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);
  const session = await createSession(peer);
  const turnIds = await storeTurns(hostId, session, FETCH_TURNS_PAGE + WIDE);

  const snapshot = await subscribe(peer, session.chat, RECENT);
  expect(snapshot.turnIds).toEqual(turnIds.slice(-RECENT));
  expect(snapshot.cursor).toBeDefined();

  const fetch = { channel: session.chat, cursor: snapshot.cursor };
  await expect(peer.request("fetchTurns", fetch)).resolves.toEqual({});

  // The connection receives the loaded page as its first action, before the fetch reply.
  const loadedAt = peer.messages.findIndex(
    (message) => "method" in message && message.method === "action",
  );

  const repliedAt = peer.messages.findLastIndex((message) => "result" in message);

  expect(loadedAt).toBeGreaterThanOrEqual(0);
  expect(loadedAt).toBeLessThan(repliedAt);

  const [firstPage] = loadedActions(peer);
  expect(firstPage?.turns.map((turn) => turn.id)).toEqual(turnIds.slice(RECENT, -RECENT));

  await expect(peer.request("fetchTurns", fetch)).resolves.toEqual({});
  expect(loadedActions(peer)).toHaveLength(1);

  await peer.request("fetchTurns", { channel: session.chat, cursor: firstPage?.turnsNextCursor });
  const [, lastPage] = loadedActions(peer);
  expect(lastPage?.turns.map((turn) => turn.id)).toEqual(turnIds.slice(0, RECENT));
  expect(lastPage?.turnsNextCursor).toBeUndefined();

  await expect(
    peer.request("fetchTurns", { channel: session.chat, cursor: "unknown" }),
  ).rejects.toThrow("Unknown turns cursor");
  expect(lastErrorCode(peer)).toBe(AHPJsonRpcErrorCodes.InvalidParams);
});

it("widens the shared window for all subscribers and keeps it after a restart", async () => {
  const hostId = crypto.randomUUID();
  const first = await connectPeer(hostId);
  const second = await connectPeer(hostId);
  const session = await createSession(first);
  const turnIds = await storeTurns(hostId, session, LONG_HISTORY);

  const narrow = await subscribe(first, session.chat, NARROW);
  expect(narrow.turnIds).toEqual(turnIds.slice(-NARROW));

  const wide = await subscribe(second, session.chat, WIDE);
  expect(wide.turnIds).toEqual(turnIds.slice(-WIDE));

  await vi.waitFor(() => {
    expect(loadedActions(first).map((action) => action.turns.length)).toEqual([WIDE - NARROW]);
  });

  // A narrower subscriber receives the shared window.
  const narrower = await subscribe(first, session.chat, 1);
  expect(narrower.turnIds).toEqual(turnIds.slice(-WIDE));

  const name = sessionDOName(hostId, session.sessionId);
  await evictDurableObject(env.CONVERSATIONS.getByName(name));
  await second.request("fetchTurns", { channel: session.chat, cursor: wide.cursor });
  const older = turnIds.slice(0, LONG_HISTORY - WIDE);

  await vi.waitFor(() => {
    for (const peer of [first, second]) {
      const loaded = loadedActions(peer).at(LAST);
      expect(loaded?.turns.map((turn) => turn.id)).toEqual(older);
    }
  });
});

it("recovers all retained turns on reconnect and widens the window of other subscribers", async () => {
  const hostId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const old = await connectPeer(hostId, clientId);
  const other = await connectPeer(hostId);
  const session = await createSession(old);
  const turnIds = await storeTurns(hostId, session, LONG_HISTORY);
  const narrow = await subscribe(old, session.chat, NARROW);
  expect(narrow.cursor).toBeDefined();

  await subscribe(other, session.chat, NARROW);
  old.close();

  const params: ReconnectParams = {
    channel: ROOT_CHANNEL,
    clientId,
    lastSeenServerSeq: old.actions.at(LAST)?.serverSeq ?? 0,
    subscriptions: [session.chat],
  };

  const peer = await openPeer(hostId);
  const [snapshot] = await reconnect(peer, params);
  const state = ChatStateSchema.parse(snapshot?.state);

  // `reconnect` has no view, so the snapshot has every turn and no cursor.
  expect(state.turns.map((turn) => turn.id)).toEqual(turnIds);
  expect(state.turnsNextCursor).toBeUndefined();
  await vi.waitFor(() => {
    expect(loadedActions(other).map((action) => action.turns.length)).toEqual([
      LONG_HISTORY - NARROW,
    ]);
  });
});

it("rejects a cursor of another chat and a fetch without a subscription", async () => {
  const hostId = crypto.randomUUID();
  const peer = await connectPeer(hostId);
  const first = await createSession(peer);
  const second = await createSession(peer);
  await storeTurns(hostId, first, SHORT_HISTORY);
  await storeTurns(hostId, second, SHORT_HISTORY);
  const { cursor } = await subscribe(peer, first.chat, 1);

  // A connection that does not subscribe to a chat cannot load its turns.
  await expect(peer.request("fetchTurns", { channel: second.chat })).rejects.toThrow(
    "Subscribe to the chat before fetching turns",
  );

  await subscribe(peer, second.chat, 1);

  await expect(peer.request("fetchTurns", { channel: second.chat, cursor })).rejects.toThrow(
    "Unknown turns cursor",
  );
  expect(lastErrorCode(peer)).toBe(AHPJsonRpcErrorCodes.InvalidParams);
});

it("publishes no chat summary update for text deltas", async () => {
  const peer = await connectPeer(crypto.randomUUID());
  const session = await createSession(peer);
  await peer.request("subscribe", { channel: session.chat });

  peer.notify("dispatchAction", {
    channel: session.chat,
    clientSeq: 1,
    action: {
      type: "chat/turnStarted",
      turnId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      message: { text: "stream", origin: { kind: "user" } },
    },
  });

  await vi.waitFor(() => {
    expect(peer.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
  });

  const types = peer.actions.map((item) => item.action.type);
  expect(types.filter((type) => type === "chat/delta")).toHaveLength(STREAM_DELTAS);
  expect(types.filter((type) => type === "session/chatUpdated")).toHaveLength(STATUS_CHANGES);
});
