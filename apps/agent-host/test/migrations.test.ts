import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import migrations from "../drizzle/migrations";
import { ROOT } from "../src/ahp/protocol";
import { createHostState, type HostState, createSession } from "./config";

const SESSION = "ahp-session:/existing";

const PREVIOUS_MIGRATION_INDEX = -2;

const ORIGIN = { clientId: "existing-client", clientSeq: 1 };

type PersistedState = {
  root: ReturnType<HostState["queries"]["readSnapshot"]>;
  session: ReturnType<HostState["queries"]["readSnapshot"]>;
  chat: ReturnType<HostState["queries"]["readSnapshot"]>;
  record: ReturnType<HostState["queries"]["requireWithActiveOutput"]>;
  acknowledgement: ReturnType<HostState["queries"]["lookupDispatchResult"]>;
  replay: ReturnType<HostState["queries"]["readReplay"]>;
};

function persistedState(store: HostState): PersistedState {
  const record = store.queries.requireWithActiveOutput(SESSION);

  return {
    root: store.queries.readSnapshot(ROOT),
    session: store.queries.readSnapshot(SESSION),
    chat: store.queries.readSnapshot(record.chatUri),
    record,
    acknowledgement: store.queries.lookupDispatchResult(ORIGIN),
    replay: store.queries.readReplay(0, [ROOT, SESSION, record.chatUri]),
  };
}

function appliedMigrations(state: DurableObjectState): number[] {
  return state.storage.sql
    .exec<{ created_at: number }>("SELECT created_at FROM __drizzle_migrations ORDER BY created_at")
    .toArray()
    .map((row) => row.created_at);
}

it("initializes a fresh database and applies generated migrations once", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.deleteAll();
    const store = createHostState(state.storage);
    await store.migrate();
    expect(store.queries.readSnapshot(ROOT)).toEqual({
      resource: ROOT,
      state: { agents: [], activeSessions: 0 },
      fromSeq: 0,
    });
    expect(store.queries.listSessions({ limit: 1 }).items).toEqual([]);
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
    const reopened = createHostState(state.storage);
    await reopened.migrate();
    expect(reopened.queries.readSnapshot(ROOT)).toEqual(store.queries.readSnapshot(ROOT));
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
  });
});

it("rejects initialization when a migration fails", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.deleteAll();
    state.storage.sql.exec("CREATE TABLE actions (seq INTEGER PRIMARY KEY)");
    const store = createHostState(state.storage);
    await expect(store.migrate()).rejects.toThrow("Rollback");
    expect(
      state.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE name IN ('host', '__drizzle_migrations')")
        .toArray(),
    ).toEqual([]);
  });
});

it("drops obsolete document storage and preserves normalized state", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, async (_instance, state) => {
    const store = createHostState(state.storage);
    createSession(store, SESSION, "existing-backend-key");
    store.mutations.bindAgentSession(SESSION, "existing-conversation");
    const record = store.queries.requireWithActiveOutput(SESSION);
    store.mutations.applyAction(record.chatUri, {
      type: "chat/turnStarted",
      turnId: "existing-turn",
      startedAt: "2026-10-01T00:00:00.000Z",
      message: { text: "Hello", origin: { kind: "user" } },
    });
    store.mutations.applyAction(record.chatUri, {
      type: "chat/responsePart",
      turnId: "existing-turn",
      part: { kind: "markdown", id: "existing-text", content: "Existing output 😀" },
    });

    const publication = store.mutations.applyAction(record.chatUri, {
      type: "chat/responsePart",
      turnId: "existing-turn",
      part: { kind: "contentRef", uri: "data:text/plain,Existing%20resource" },
    });

    const [envelope] = publication.actions;

    if (
      envelope.action.type !== "chat/responsePart" ||
      envelope.action.part.kind !== "contentRef"
    ) {
      throw new Error("Expected content reference");
    }

    const resource = envelope.action.part.uri;
    store.mutations.applyAction(record.chatUri, {
      type: "chat/turnComplete",
      turnId: "existing-turn",
      duration: 1,
    });
    store.mutations.commitDispatch({
      record: store.queries.requireWithActiveOutput(SESSION),
      channel: SESSION,
      action: { type: "session/titleChanged", title: "Existing session" },
      origin: ORIGIN,
      frame: "existing-dispatch",
    });
    const before = persistedState(store);
    state.storage.sql.exec(
      "CREATE TABLE document_chunks (scope TEXT, id TEXT, chunk INTEGER, data BLOB, PRIMARY KEY (scope, id, chunk))",
    );
    state.storage.sql.exec("ALTER TABLE text_pieces ADD COLUMN json INTEGER NOT NULL DEFAULT 0");
    state.storage.sql.exec("ALTER TABLE content_pieces ADD COLUMN json INTEGER NOT NULL DEFAULT 0");
    const previous = migrations.journal.entries.at(PREVIOUS_MIGRATION_INDEX);

    if (!previous) {
      throw new Error("Missing preceding migration");
    }

    state.storage.sql.exec("DELETE FROM __drizzle_migrations WHERE created_at > ?", previous.when);

    const reopened = createHostState(state.storage);
    await reopened.migrate();
    expect(persistedState(reopened)).toEqual(before);
    expect(reopened.queries.readResource(resource).data).toBe("Existing resource");
    expect(
      state.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE name = 'document_chunks'")
        .toArray(),
    ).toEqual([]);
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
    const reopenedAgain = createHostState(state.storage);
    await reopenedAgain.migrate();
    expect(persistedState(reopenedAgain)).toEqual(before);
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
  });
});
