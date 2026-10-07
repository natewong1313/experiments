import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import {
  ChatStateSchema,
  SessionStateSchema,
  type ChatAction,
} from "@experiments/protocol-schemas/ahp";
import { AgentHost } from "../src/agent-host";
import { createHostState, type HostState, createSession } from "./config";
import { reduceChat, reduceSession } from "../src/state/reducers";

const SESSION = "ahp-session:/test";

const START_TIME = "2026-10-01T00:00:00.000Z";

const RESPONSE_BYTES = 1_200_000;

const DELTA_BYTES = 300_000;

const CHUNK_BYTES = 65_536;

const PAGE_SIZE = 10;

const ERROR_STATUS = 2;

const IN_PROGRESS = 8;

const READ = 32;

const MAX_DELTA_CHUNKS = 1;

function ready(store: HostState): string {
  createSession(store, SESSION, "generation-1");
  store.mutations.applyAction(SESSION, { type: "session/ready" });

  return store.queries.requireWithActiveOutput(SESSION).chatUri;
}

function turnStarted(turnId: string): ChatAction {
  return {
    type: "chat/turnStarted",
    turnId,
    startedAt: START_TIME,
    message: { text: "Hello", origin: { kind: "user" } },
  };
}

function completeTurn(store: HostState, chat: string, turnId: string): void {
  store.mutations.applyAction(chat, turnStarted(turnId));
  store.mutations.applyAction(chat, {
    type: "chat/responsePart",
    turnId,
    part: { kind: "markdown", id: turnId, content: "" },
  });

  for (let written = 0; written < RESPONSE_BYTES; written += DELTA_BYTES) {
    store.mutations.applyAction(chat, {
      type: "chat/delta",
      turnId,
      partId: turnId,
      content: "x".repeat(DELTA_BYTES),
    });
  }

  store.mutations.applyAction(chat, { type: "chat/turnComplete", turnId, duration: 1 });
}

async function withStore(
  inspect: (store: HostState, state: DurableObjectState) => void,
): Promise<void> {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeInstanceOf(AgentHost);
    const store = createHostState(state.storage);
    inspect(store, state);
  });
}

it("keeps session and chat snapshots equal to reduced live and replayed actions", async () => {
  await withStore((store) => {
    const chat = ready(store);
    store.mutations.applyAction(SESSION, { type: "session/isReadChanged", isRead: true });
    let sessionMirror = SessionStateSchema.parse(store.queries.readSnapshot(SESSION).state);
    let chatMirror = ChatStateSchema.parse(store.queries.readSnapshot(chat).state);
    const cut = store.queries.sequence;

    const publications = [
      store.mutations.applyAction(chat, turnStarted("turn")),
      store.mutations.applyAction(chat, {
        type: "chat/responsePart",
        turnId: "turn",
        part: { kind: "markdown", id: "part", content: "" },
      }),
      store.mutations.applyAction(chat, {
        type: "chat/delta",
        turnId: "turn",
        partId: "part",
        content: "Hello",
      }),
      store.mutations.applyAction(chat, {
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
    expect(sequences).toEqual(sequences.toSorted((left, right) => left - right));

    for (const envelope of actions) {
      if (envelope.channel === SESSION) {
        sessionMirror = reduceSession(sessionMirror, envelope.action);
      } else {
        chatMirror = reduceChat(chatMirror, envelope.action);
      }
    }

    expect(store.queries.readSnapshot(SESSION).state).toEqual(sessionMirror);
    expect(store.queries.readSnapshot(chat).state).toEqual(chatMirror);
    expect(store.queries.readReplay(cut, [SESSION, chat])).toEqual(actions);
    expect(store.queries.listSessions({ limit: PAGE_SIZE }).items[0]?.status).toBe(
      ERROR_STATUS | READ,
    );
  });
});

it("appends only the incoming text piece and emits no unchanged summary for a delta", async () => {
  await withStore((store, state) => {
    const chat = ready(store);
    store.mutations.applyAction(chat, turnStarted("turn"));
    store.mutations.applyAction(chat, {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "part", content: "x".repeat(DELTA_BYTES) },
    });
    const { sql } = state.storage;
    sql.exec(`
      CREATE TABLE chunk_writes (scope TEXT, id TEXT, bytes INTEGER);
      CREATE TRIGGER record_insert AFTER INSERT ON text_pieces BEGIN INSERT INTO chunk_writes VALUES (NEW.chat_uri, NEW.turn_id, LENGTH(CAST(NEW.text AS BLOB))); END;
      CREATE TRIGGER forbid_text_rewrite BEFORE UPDATE ON text_pieces BEGIN SELECT RAISE(ABORT, 'previous text rewritten'); END;
    `);

    const publication = store.mutations.applyAction(chat, {
      type: "chat/delta",
      turnId: "turn",
      partId: "part",
      content: "x",
    });

    const writes = sql
      .exec<{ scope: string; bytes: number }>("SELECT scope, bytes FROM chunk_writes")
      .toArray();

    expect(writes.length).toBeGreaterThan(0);
    expect(writes.length).toBeLessThanOrEqual(MAX_DELTA_CHUNKS);

    for (const write of writes) {
      expect(write.scope).toBe(chat);
      expect(write.bytes).toBe(JSON.stringify("x").length);
      expect(write.bytes).toBeLessThanOrEqual(CHUNK_BYTES);
    }

    expect(publication.actions).toHaveLength(1);
    expect(publication.summary).toBeUndefined();
    expect(store.queries.listSessions({ limit: PAGE_SIZE }).items[0]?.status).toBe(IN_PROGRESS);
  });
});

it("retains history larger than a SQL row across eviction without loading it into live state", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeInstanceOf(AgentHost);
    const store = createHostState(state.storage);
    const chat = ready(store);
    completeTurn(store, chat, "first");
    completeTurn(store, chat, "second");
    expect(store.queries.requireWithActiveOutput(chat).chat.turns).toEqual([]);
    expect(store.queries.hasCompletedTurn(chat, "first")).toBe(true);

    const { maximum } = state.storage.sql
      .exec<{ maximum: number }>(
        "SELECT MAX(LENGTH(CAST(text AS BLOB))) AS maximum FROM text_pieces",
      )
      .one();

    expect(maximum).toBeLessThanOrEqual(CHUNK_BYTES);
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeInstanceOf(AgentHost);
    const store = createHostState(state.storage);
    const chat = store.queries.requireWithActiveOutput(SESSION).chatUri;
    const snapshot = ChatStateSchema.parse(store.queries.readSnapshot(chat).state);
    expect(snapshot.turns.map((turn) => turn.id)).toEqual(["first", "second"]);

    for (const turn of snapshot.turns) {
      expect(turn.state).toBe("complete");
      expect(turn.responseParts).toEqual([
        { kind: "markdown", id: turn.id, content: "x".repeat(RESPONSE_BYTES) },
      ]);
    }

    expect(store.queries.hasCompletedTurn(chat, "first")).toBe(true);
  });
});

it("rolls back state and sequence together when a chunk write fails", async () => {
  await withStore((store, state) => {
    const chat = ready(store);
    store.mutations.applyAction(chat, turnStarted("turn"));
    const before = store.queries.readSnapshot(chat);
    state.storage.sql.exec(
      "CREATE TRIGGER fail_chunk BEFORE INSERT ON text_pieces WHEN NEW.piece = 1 BEGIN SELECT RAISE(ABORT, 'chunk write failed'); END",
    );
    expect(() =>
      store.mutations.applyAction(chat, {
        type: "chat/responsePart",
        turnId: "turn",
        part: {
          kind: "markdown",
          id: "part",
          content: "x".repeat(DELTA_BYTES),
        },
      }),
    ).toThrow("chunk write failed");
    expect(store.queries.readSnapshot(chat)).toEqual(before);
  });
});

it("rolls back a dispatch if its acknowledgement cannot be persisted and permits a retry", async () => {
  await withStore((store, state) => {
    ready(store);
    const before = store.queries.readSnapshot(SESSION);

    const input = {
      record: store.queries.requireWithActiveOutput(SESSION),
      channel: SESSION,
      action: { type: "session/titleChanged", title: "Renamed" } as const,
      origin: { clientId: "client", clientSeq: 1 },
      frame: "title-dispatch",
    };

    state.storage.sql.exec(
      "CREATE TRIGGER fail_ack BEFORE INSERT ON dispatches BEGIN SELECT RAISE(ABORT, 'ack write failed'); END",
    );
    expect(() => store.mutations.commitDispatch(input)).toThrow("ack write failed");
    expect(store.queries.readSnapshot(SESSION)).toEqual(before);
    expect(store.queries.lookupDispatchResult(input.origin)).toBeNull();
    expect(store.queries.readReplay(before.fromSeq, [SESSION])).toEqual([]);
    state.storage.sql.exec("DROP TRIGGER fail_ack");
    const publication = store.mutations.commitDispatch(input);
    const reopened = createHostState(state.storage);
    expect(reopened.queries.lookupDispatchResult(input.origin)).toEqual({
      frame: input.frame,
      envelope: publication.actions[0],
    });
    expect(reopened.queries.readSnapshot(SESSION).state).toMatchObject({
      title: "Renamed",
    });
  });
});

it("paginates metadata without reading chats and rejects a chat URI as a session cursor", async () => {
  await withStore((store) => {
    const chat = ready(store);
    const nextSession = `${SESSION}-next`;
    createSession(store, nextSession, "generation-2");
    const first = store.queries.listSessions({ limit: 1 });
    expect(first.items.map((item) => item.resource)).toEqual([SESSION]);
    expect(first.nextCursor).toBe(SESSION);
    const next = store.queries.listSessions({ cursor: first.nextCursor, limit: 1 });
    expect(next.items.map((item) => item.resource)).toEqual([nextSession]);
    expect(next.nextCursor).toBeUndefined();
    expect(() => store.queries.listSessions({ cursor: chat, limit: 1 })).toThrow(
      "Invalid session cursor",
    );
  });
});
