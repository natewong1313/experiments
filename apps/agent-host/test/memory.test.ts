import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import {
  ChatStateSchema,
  InitializeResultSchema,
  SubscribeResultSchema,
} from "@experiments/protocol-schemas/ahp";
import { HostStore } from "../src/state/store";
import { MemoryLimitError, MAX_TURN_BYTES, MAX_REPLAY_BYTES } from "../src/memory";
import { createSession } from "./config";
import { connectPeer, Peer } from "./peer";
import { reduceChat } from "../src/state/reducers";

const SESSION = "ahp-session:/memory";

const ROOT = "ahp-root://";

const STARTED_AT = "2026-10-01T00:00:00.000Z";

const TURN_BYTES = 700_000;

const HISTORY_TURNS = 7;

const DUPLICATE_SUBSCRIPTIONS = 64;

function completeTurn(store: HostStore, chat: string, id: string): void {
  store.applyAction(chat, {
    type: "chat/turnStarted",
    turnId: id,
    startedAt: STARTED_AT,
    message: { text: "Hello", origin: { kind: "user" } },
  });
  store.applyAction(chat, {
    type: "chat/responsePart",
    turnId: id,
    part: { kind: "markdown", id, content: "x".repeat(TURN_BYTES) },
  });
  store.applyAction(chat, { type: "chat/turnComplete", turnId: id, duration: 1 });
}

async function populatedHost(): Promise<{
  stub: DurableObjectStub;
  chat: string;
}> {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());

  const chat = await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    createSession(store, SESSION, "memory");
    store.applyAction(SESSION, { type: "session/ready" });
    const record = store.requireWithActiveOutput(SESSION);

    for (let index = 0; index < HISTORY_TURNS; index++) {
      completeTurn(store, record.chatUri, `turn-${index}`);
    }

    return record.chatUri;
  });

  return { stub, chat };
}

it("rejects oversized history before assembling turns and leaves history intact", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    const parse = vi.spyOn(JSON, "parse");

    try {
      expect(() => store.readSnapshot(chat)).toThrow(MemoryLimitError);
      expect(parse.mock.calls.every(([text]) => text.length < TURN_BYTES)).toBe(true);
    } finally {
      parse.mockRestore();
    }

    expect(
      state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM turns").one().count,
    ).toBe(HISTORY_TURNS);
    const snapshot = ChatStateSchema.parse(store.readSnapshot(chat, 1).state);
    expect(snapshot.turns.map((turn) => turn.id)).toEqual([`turn-${HISTORY_TURNS - 1}`]);
    expect(snapshot.turnsNextCursor).toBeDefined();
  });
});

it("pages history over AHP in order without reinserting persisted turns", async () => {
  const { stub, chat } = await populatedHost();
  const peer = await connectPeer(stub);

  try {
    await expect(peer.request("subscribe", { channel: chat })).rejects.toThrow("memory budget");

    const response = SubscribeResultSchema.parse(
      await peer.request("subscribe", { channel: chat, view: { turns: 0 } }),
    );

    let mirror = ChatStateSchema.parse(response.snapshot?.state);
    expect(mirror.turns).toEqual([]);
    let consumed = 0;

    while (mirror.turnsNextCursor !== void 0) {
      // oxlint-disable-next-line no-await-in-loop -- Each request needs the preceding page cursor.
      await peer.request("fetchTurns", {
        channel: chat,
        cursor: mirror.turnsNextCursor,
      });
      const incoming = peer.actions.slice(consumed);
      expect(incoming.length).toBeGreaterThan(0);

      for (const envelope of incoming) {
        mirror = reduceChat(mirror, envelope.action);
      }

      consumed = peer.actions.length;
    }

    expect(mirror.turns.map((turn) => turn.id)).toEqual(
      Array.from({ length: HISTORY_TURNS }, (_, index) => `turn-${index}`),
    );
    await runInDurableObject(stub, (instance, state) => {
      expect(instance).toBeDefined();
      expect(
        state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM turns").one()
          .count,
      ).toBe(HISTORY_TURNS);
      const store = new HostStore(state);
      expect(store.requireWithActiveOutput(chat).chat.turns).toEqual([]);
    });
    const wrongCursor = JSON.stringify({ channel: "another-chat", before: 1 });
    await expect(
      peer.request("fetchTurns", {
        channel: chat,
        cursor: wrongCursor,
      }),
    ).rejects.toThrow("Invalid turn-history cursor");
  } finally {
    peer.close();
  }
});

it("stops delivering fetched history after unsubscribing and resumes on subscription", async () => {
  const { stub, chat } = await populatedHost();
  const peer = await connectPeer(stub);

  try {
    const response = SubscribeResultSchema.parse(
      await peer.request("subscribe", { channel: chat, view: { turns: 0 } }),
    );

    const { turnsNextCursor } = ChatStateSchema.parse(response.snapshot?.state);
    expect(turnsNextCursor).toBeDefined();
    peer.notify("unsubscribe", { channel: chat });
    await peer.request("fetchTurns", { channel: chat, cursor: turnsNextCursor });
    await peer.request("ping", { channel: "ahp-root://" });
    expect(peer.actions).toEqual([]);

    await peer.request("subscribe", { channel: chat, view: { turns: 0 } });
    await peer.request("fetchTurns", { channel: chat, cursor: turnsNextCursor });
    expect(peer.actions).toMatchObject([{ channel: chat, action: { type: "chat/turnsLoaded" } }]);
  } finally {
    peer.close();
  }
});

it("deduplicates initialization subscriptions before loading snapshots", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    state.storage.sql.exec("DELETE FROM turns WHERE turn_id != 'turn-0'");
  });

  const response = await stub.fetch("https://host/ahp", {
    headers: { Upgrade: "websocket" },
  });

  if (!response.webSocket) {
    throw new Error("Missing WebSocket");
  }

  const peer = new Peer(response.webSocket);

  try {
    const subscriptions = Array.from({ length: DUPLICATE_SUBSCRIPTIONS }, () => chat);

    const result = InitializeResultSchema.parse(
      await peer.request("initialize", {
        channel: ROOT,
        clientId: "duplicate-client",
        protocolVersions: [PROTOCOL_VERSION],
        initialSubscriptions: subscriptions,
      }),
    );

    expect(result.snapshots).toHaveLength(1);
  } finally {
    peer.close();
  }
});

it("filters replay in SQL and falls back before parsing an oversized selected replay", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);

    const total = state.storage.sql
      .exec<{ bytes: number }>("SELECT SUM(LENGTH(envelope)) AS bytes FROM actions")
      .one().bytes;

    expect(total).toBeLessThanOrEqual(MAX_REPLAY_BYTES);
    const parse = vi.spyOn(JSON, "parse");

    try {
      expect(store.readReplay(0, [chat])).toBeNull();
      expect(store.readReplay(store.sequence, [])).toEqual([]);
      const root = store.readReplay(store.sequence, [ROOT]);
      expect(root?.every((envelope) => envelope.channel === ROOT)).toBe(true);
      expect(parse.mock.calls.every(([text]) => text.length < TURN_BYTES)).toBe(true);
    } finally {
      parse.mockRestore();
    }
  });
});

it("checks aggregate snapshot size before loading any subscribed chat", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    const parse = vi.spyOn(JSON, "parse");

    try {
      expect(() => store.readSnapshots([ROOT, SESSION, chat])).toThrow(MemoryLimitError);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });
});

it("rolls back oversized live updates", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    store.applyAction(chat, {
      type: "chat/turnStarted",
      turnId: "oversized",
      startedAt: STARTED_AT,
      message: { text: "Hello", origin: { kind: "user" } },
    });
    const { sequence } = store;
    expect(() =>
      store.applyAction(chat, {
        type: "chat/responsePart",
        turnId: "oversized",
        part: {
          kind: "markdown",
          id: "big",
          content: "x".repeat(MAX_TURN_BYTES),
        },
      }),
    ).toThrow(MemoryLimitError);
    expect(store.sequence).toBe(sequence);
    expect(store.requireWithActiveOutput(chat).chat.activeTurn?.responseParts).toEqual([]);
    store.applyAction(chat, {
      type: "chat/turnComplete",
      turnId: "oversized",
      duration: 1,
    });
  });
});

it("recovers only interrupted sessions without loading unrelated chat output", async () => {
  const { stub } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    const creating = "ahp-session:/creating";
    createSession(store, creating, "creating");
    const active = "ahp-session:/active";
    createSession(store, active, "active");
    store.applyAction(active, { type: "session/ready" });
    const live = store.requireWithActiveOutput(active);
    store.applyAction(live.chatUri, {
      type: "chat/turnStarted",
      turnId: "active",
      startedAt: STARTED_AT,
      message: { text: "Hello", origin: { kind: "user" } },
    });

    const queries = vi.spyOn(state.storage.sql, "exec");

    try {
      const interrupted = Array.from(store.recoverableSessions(), (record) => record.uri);
      expect(interrupted).toEqual([active, creating]);
      expect(queries.mock.calls.some(([query]) => query.includes("FROM text_pieces"))).toBe(false);
      expect(queries.mock.calls.some(([query]) => query.includes("FROM reply_parts"))).toBe(false);
    } finally {
      queries.mockRestore();
    }
  });
});
