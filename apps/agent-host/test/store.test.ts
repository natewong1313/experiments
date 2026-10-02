import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import {
  ChatStateSchema,
  SessionStateSchema,
  type ChatAction,
} from "@experiments/protocol-schemas/ahp";
import { AgentHost } from "../src/agent-host";
import { HostStore } from "../src/state/store";
import { reduceChat, reduceSession } from "../src/state/reducers";
import { createSession } from "./config";

const SESSION = "ahp-session:/test";
const START_TIME = "2026-10-01T00:00:00.000Z";
const RESPONSE_BYTES = 1_200_000;
const DELTA_BYTES = 300_000;
const CHUNK_BYTES = 65_536;
const PAGE_SIZE = 10;
const ERROR_STATUS = 2;
const IN_PROGRESS = 8;
const READ = 32;
const MAX_DELTA_CHUNKS = 2;

function ready(store: HostStore): string {
  createSession(store, SESSION, "generation-1");
  store.apply(SESSION, { type: "session/ready" });
  return store.require(SESSION).chatUri;
}

function turnStarted(turnId: string): ChatAction {
  return {
    type: "chat/turnStarted",
    turnId,
    startedAt: START_TIME,
    message: { text: "Hello", origin: { kind: "user" } },
  };
}

function completeTurn(store: HostStore, chat: string, turnId: string): void {
  store.apply(chat, turnStarted(turnId));
  store.apply(chat, {
    type: "chat/responsePart",
    turnId,
    part: { kind: "markdown", id: turnId, content: "" },
  });
  for (let written = 0; written < RESPONSE_BYTES; written += DELTA_BYTES) {
    store.apply(chat, {
      type: "chat/delta",
      turnId,
      partId: turnId,
      content: "x".repeat(DELTA_BYTES),
    });
  }
  store.apply(chat, { type: "chat/turnComplete", turnId, duration: 1 });
}

async function withStore(
  inspect: (store: HostStore, state: DurableObjectState) => void,
): Promise<void> {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeInstanceOf(AgentHost);
    inspect(new HostStore(state), state);
  });
}

it("keeps session and chat snapshots equal to reduced live and replayed actions", async () => {
  await withStore((store) => {
    const chat = ready(store);
    store.apply(SESSION, { type: "session/isReadChanged", isRead: true });
    let sessionMirror = SessionStateSchema.parse(store.snapshot(SESSION).state);
    let chatMirror = ChatStateSchema.parse(store.snapshot(chat).state);
    const cut = store.sequence;
    const publications = [
      store.apply(chat, turnStarted("turn")),
      store.apply(chat, {
        type: "chat/responsePart",
        turnId: "turn",
        part: { kind: "markdown", id: "part", content: "" },
      }),
      store.apply(chat, {
        type: "chat/delta",
        turnId: "turn",
        partId: "part",
        content: "Hello",
      }),
      store.apply(chat, {
        type: "chat/error",
        turnId: "turn",
        duration: 1,
        part: {
          kind: "error",
          error: { errorType: "agent", message: "failed" },
          resumable: false,
        },
      }),
    ];
    const actions = publications.flatMap((publication) => publication.actions);
    const sequences = actions.map((envelope) => envelope.serverSeq);
    expect(sequences).toEqual(
      sequences.toSorted((left, right) => left - right),
    );
    for (const envelope of actions) {
      if (envelope.channel === SESSION) {
        sessionMirror = reduceSession(sessionMirror, envelope.action);
      } else {
        chatMirror = reduceChat(chatMirror, envelope.action);
      }
    }
    expect(store.snapshot(SESSION).state).toEqual(sessionMirror);
    expect(store.snapshot(chat).state).toEqual(chatMirror);
    expect(store.replay(cut, [SESSION, chat])).toEqual(actions);
    expect(store.list({ limit: PAGE_SIZE }).items[0]?.status).toBe(
      ERROR_STATUS | READ,
    );
  });
});

it("writes only bounded live chunks and emits no unchanged summary for a delta", async () => {
  await withStore((store, state) => {
    const chat = ready(store);
    store.apply(chat, turnStarted("turn"));
    store.apply(chat, {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "part", content: "x".repeat(DELTA_BYTES) },
    });
    const { sql } = state.storage;
    sql.exec(`
      CREATE TABLE chunk_writes (scope TEXT, id TEXT, bytes INTEGER);
      CREATE TRIGGER record_insert AFTER INSERT ON document_chunks BEGIN INSERT INTO chunk_writes VALUES (NEW.scope, NEW.id, LENGTH(NEW.data)); END;
      CREATE TRIGGER record_update AFTER UPDATE ON document_chunks BEGIN INSERT INTO chunk_writes VALUES (NEW.scope, NEW.id, LENGTH(NEW.data)); END;
    `);
    const publication = store.apply(chat, {
      type: "chat/delta",
      turnId: "turn",
      partId: "part",
      content: "x",
    });
    const writes = sql
      .exec<{ scope: string; bytes: number }>(
        "SELECT scope, bytes FROM chunk_writes",
      )
      .toArray();
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.length).toBeLessThanOrEqual(MAX_DELTA_CHUNKS);
    for (const write of writes) {
      expect(write.scope).toBe("chat");
      expect(write.bytes).toBeLessThanOrEqual(CHUNK_BYTES);
    }
    expect(publication.actions).toHaveLength(1);
    expect(publication.summary).toBeUndefined();
    expect(store.list({ limit: PAGE_SIZE }).items[0]?.status).toBe(IN_PROGRESS);
  });
});

it("retains history larger than a SQL row across eviction without loading it into live state", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeInstanceOf(AgentHost);
    const store = new HostStore(state);
    const chat = ready(store);
    completeTurn(store, chat, "first");
    completeTurn(store, chat, "second");
    expect(store.require(chat).chat.turns).toEqual([]);
    expect(store.hasTurn(chat, "first")).toBe(true);
    const { maximum } = state.storage.sql
      .exec<{ maximum: number }>(
        "SELECT MAX(LENGTH(data)) AS maximum FROM document_chunks",
      )
      .one();
    expect(maximum).toBeLessThanOrEqual(CHUNK_BYTES);
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeInstanceOf(AgentHost);
    const store = new HostStore(state);
    const chat = store.require(SESSION).chatUri;
    const snapshot = ChatStateSchema.parse(store.snapshot(chat).state);
    expect(snapshot.turns.map((turn) => turn.id)).toEqual(["first", "second"]);
    for (const turn of snapshot.turns) {
      expect(turn.state).toBe("complete");
      expect(turn.responseParts).toEqual([
        { kind: "markdown", id: turn.id, content: "x".repeat(RESPONSE_BYTES) },
      ]);
    }
    expect(store.hasTurn(chat, "first")).toBe(true);
  });
});

it("rolls back state and sequence together when a chunk write fails", async () => {
  await withStore((store, state) => {
    const chat = ready(store);
    store.apply(chat, turnStarted("turn"));
    const before = store.snapshot(chat);
    state.storage.sql.exec(
      "CREATE TRIGGER fail_chunk BEFORE INSERT ON document_chunks WHEN NEW.scope = 'chat' AND NEW.chunk = 1 BEGIN SELECT RAISE(ABORT, 'chunk write failed'); END",
    );
    expect(() =>
      store.apply(chat, {
        type: "chat/responsePart",
        turnId: "turn",
        part: {
          kind: "markdown",
          id: "part",
          content: "x".repeat(DELTA_BYTES),
        },
      }),
    ).toThrow("chunk write failed");
    expect(store.snapshot(chat)).toEqual(before);
  });
});

it("rolls back a dispatch if its acknowledgement cannot be persisted and permits a retry", async () => {
  await withStore((store, state) => {
    ready(store);
    const before = store.snapshot(SESSION);
    const input = {
      record: store.require(SESSION),
      channel: SESSION,
      action: { type: "session/titleChanged", title: "Renamed" } as const,
      origin: { clientId: "client", clientSeq: 1 },
      frame: "title-dispatch",
    };
    state.storage.sql.exec(
      "CREATE TRIGGER fail_ack BEFORE INSERT ON dispatches BEGIN SELECT RAISE(ABORT, 'ack write failed'); END",
    );
    expect(() => store.dispatch(input)).toThrow("ack write failed");
    expect(store.snapshot(SESSION)).toEqual(before);
    expect(store.previous(input.origin)).toBeNull();
    expect(store.replay(before.fromSeq, [SESSION])).toEqual([]);
    state.storage.sql.exec("DROP TRIGGER fail_ack");
    const publication = store.dispatch(input);
    const reopened = new HostStore(state);
    expect(reopened.previous(input.origin)).toEqual({
      frame: input.frame,
      envelope: publication.actions[0],
    });
    expect(reopened.snapshot(SESSION).state).toMatchObject({
      title: "Renamed",
    });
  });
});

it("paginates metadata without reading chats and rejects a chat URI as a session cursor", async () => {
  await withStore((store, state) => {
    const chat = ready(store);
    const nextSession = `${SESSION}-next`;
    createSession(store, nextSession, "generation-2");
    state.storage.sql.exec(
      "DELETE FROM document_chunks WHERE scope = 'chat' AND id = ?",
      chat,
    );
    const first = store.list({ limit: 1 });
    expect(first.items.map((item) => item.resource)).toEqual([SESSION]);
    expect(first.nextCursor).toBe(SESSION);
    const next = store.list({ cursor: first.nextCursor, limit: 1 });
    expect(next.items.map((item) => item.resource)).toEqual([nextSession]);
    expect(next.nextCursor).toBeUndefined();
    expect(() => store.list({ cursor: chat, limit: 1 })).toThrow(
      "Invalid session cursor",
    );
  });
});
