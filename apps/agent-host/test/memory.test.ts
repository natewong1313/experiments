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
import { JsonDocuments } from "../src/storage/json-documents";
import { MemoryLimitError, MAX_DOCUMENT_BYTES, MAX_REPLAY_BYTES } from "../src/memory";
import { createSession } from "./config";
import { connectPeer, Peer } from "./peer";
import { reduceChat } from "../src/state/reducers";

const SESSION = "ahp-session:/memory";

const ROOT = "ahp-root://";

const STARTED_AT = "2026-10-01T00:00:00.000Z";

const TURN_BYTES = 700_000;

const HISTORY_TURNS = 7;

const DUPLICATE_SUBSCRIPTIONS = 64;

const CHUNK_BYTES = 65_536;

function completeTurn(store: HostStore, chat: string, id: string): void {
  store.apply(chat, {
    type: "chat/turnStarted",
    turnId: id,
    startedAt: STARTED_AT,
    message: { text: "Hello", origin: { kind: "user" } },
  });
  store.apply(chat, {
    type: "chat/responsePart",
    turnId: id,
    part: { kind: "markdown", id, content: "x".repeat(TURN_BYTES) },
  });
  store.apply(chat, { type: "chat/turnComplete", turnId: id, duration: 1 });
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
    store.apply(SESSION, { type: "session/ready" });
    const record = store.require(SESSION);

    for (let index = 0; index < HISTORY_TURNS; index++) {
      completeTurn(store, record.chatUri, `turn-${index}`);
    }

    return record.chatUri;
  });

  return { stub, chat };
}

it("rejects oversized history before parsing turn documents and leaves history intact", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    const parse = vi.spyOn(JSON, "parse");

    try {
      expect(() => store.snapshot(chat)).toThrow(MemoryLimitError);
      expect(parse.mock.calls.every(([text]) => text.length < TURN_BYTES)).toBe(true);
    } finally {
      parse.mockRestore();
    }

    expect(
      state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM turns").one().count,
    ).toBe(HISTORY_TURNS);
    const snapshot = ChatStateSchema.parse(store.snapshot(chat, 1).state);
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
      expect(store.require(chat).chat.turns).toEqual([]);
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
    state.storage.sql.exec("DELETE FROM document_chunks WHERE scope = ? AND id != 'turn-0'", chat);
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

    expect(total).toBeGreaterThan(MAX_REPLAY_BYTES);
    const parse = vi.spyOn(JSON, "parse");

    try {
      expect(store.replay(0, [chat])).toBeNull();
      expect(store.replay(0, [])).toEqual([]);
      const root = store.replay(0, [ROOT]);
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
      expect(() => store.snapshots([ROOT, SESSION, chat])).toThrow(MemoryLimitError);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
    }
  });
});

it("bounds legacy document reads before allocating and rolls back oversized live updates", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    store.apply(chat, {
      type: "chat/turnStarted",
      turnId: "oversized",
      startedAt: STARTED_AT,
      message: { text: "Hello", origin: { kind: "user" } },
    });
    const { sequence } = store;
    expect(() =>
      store.apply(chat, {
        type: "chat/responsePart",
        turnId: "oversized",
        part: {
          kind: "markdown",
          id: "big",
          content: "x".repeat(MAX_DOCUMENT_BYTES),
        },
      }),
    ).toThrow(MemoryLimitError);
    expect(store.sequence).toBe(sequence);
    expect(store.require(chat).chat.activeTurn?.responseParts).toEqual([]);
    store.apply(chat, {
      type: "chat/turnComplete",
      turnId: "oversized",
      duration: 1,
    });

    for (let chunk = 0; chunk <= MAX_DOCUMENT_BYTES / CHUNK_BYTES; chunk++) {
      state.storage.sql.exec(
        "INSERT INTO document_chunks VALUES ('legacy', 'huge', ?, zeroblob(?))",
        chunk,
        CHUNK_BYTES,
      );
    }

    const documents = new JsonDocuments(state.storage.sql);
    expect(() => documents.read("legacy", "huge")).toThrow("Stored document exceeds");
  });
});

it("recovers only interrupted sessions and preserves oversized legacy data without blocking other sessions", async () => {
  const { stub, chat } = await populatedHost();
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();
    const store = new HostStore(state);
    const creating = "ahp-session:/creating";
    createSession(store, creating, "creating");
    const active = "ahp-session:/active";
    createSession(store, active, "active");
    store.apply(active, { type: "session/ready" });
    const live = store.require(active);
    store.apply(live.chatUri, {
      type: "chat/turnStarted",
      turnId: "active",
      startedAt: STARTED_AT,
      message: { text: "Hello", origin: { kind: "user" } },
    });
    state.storage.sql.exec("DELETE FROM document_chunks WHERE scope = 'chat' AND id = ?", chat);

    const interrupted = Array.from(store.recoverableSessions(), (record) => record.uri);

    expect(interrupted).toEqual([active, creating]);

    for (let chunk = 1; chunk <= MAX_DOCUMENT_BYTES / CHUNK_BYTES; chunk++) {
      state.storage.sql.exec(
        "INSERT INTO document_chunks VALUES ('chat', ?, ?, zeroblob(?))",
        live.chatUri,
        chunk,
        CHUNK_BYTES,
      );
    }

    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const recoverable = Array.from(store.recoverableSessions(), (record) => record.uri);

      expect(recoverable).toEqual([creating]);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "host_recovery_document_too_large",
          session: active,
        }),
      );
    } finally {
      log.mockRestore();
    }

    const documents = new JsonDocuments(state.storage.sql);
    expect(documents.size("chat", live.chatUri)).toBeGreaterThan(MAX_DOCUMENT_BYTES);
    expect(store.requireMetadata(active).chatUri).toBe(live.chatUri);
    store.remove(active);
    expect(documents.size("chat", live.chatUri)).toBe(0);
  });
});
