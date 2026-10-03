import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import migrations from "../drizzle/migrations";
import { ROOT } from "../src/ahp/protocol";
import { HostStore } from "../src/state/store";
import { createSession } from "./config";

const LEGACY_MIGRATION_TIME = 1_735_689_600_000;

const SESSION = "ahp-session:/legacy";

const ORIGIN = { clientId: "legacy-client", clientSeq: 1 };

type PersistedState = {
  root: ReturnType<HostStore["snapshot"]>;
  session: ReturnType<HostStore["snapshot"]>;
  chat: ReturnType<HostStore["snapshot"]>;
  record: ReturnType<HostStore["require"]>;
  acknowledgement: ReturnType<HostStore["previous"]>;
  replay: ReturnType<HostStore["replay"]>;
};

function persistedState(store: HostStore): PersistedState {
  const record = store.require(SESSION);

  return {
    root: store.snapshot(ROOT),
    session: store.snapshot(SESSION),
    chat: store.snapshot(record.chatUri),
    record,
    acknowledgement: store.previous(ORIGIN),
    replay: store.replay(0, [ROOT, SESSION, record.chatUri]),
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
    const store = new HostStore(state);
    expect(store.snapshot(ROOT)).toEqual({
      resource: ROOT,
      state: { agents: [], activeSessions: 0 },
      fromSeq: 0,
    });
    expect(store.list({ limit: 1 }).items).toEqual([]);
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
    const reopened = new HostStore(state);
    expect(reopened.snapshot(ROOT)).toEqual(store.snapshot(ROOT));
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
  });
});

it("skips the original schema migration and preserves existing state", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, (_instance, state) => {
    const store = new HostStore(state);
    createSession(store, SESSION, "legacy-backend-key");
    store.bindAgent(SESSION, "legacy-conversation");
    const record = store.require(SESSION);
    store.apply(record.chatUri, {
      type: "chat/turnStarted",
      turnId: "legacy-turn",
      startedAt: "2026-10-01T00:00:00.000Z",
      message: { text: "Hello", origin: { kind: "user" } },
    });
    store.apply(record.chatUri, {
      type: "chat/turnComplete",
      turnId: "legacy-turn",
      duration: 1,
    });
    store.dispatch({
      record: store.require(SESSION),
      channel: SESSION,
      action: { type: "session/titleChanged", title: "Existing session" },
      origin: ORIGIN,
      frame: "legacy-dispatch",
    });
    const before = persistedState(store);
    state.storage.sql.exec(
      "DELETE FROM __drizzle_migrations WHERE created_at > ?",
      LEGACY_MIGRATION_TIME,
    );
    expect(appliedMigrations(state)).toEqual([LEGACY_MIGRATION_TIME]);

    const reopened = new HostStore(state);
    expect(persistedState(reopened)).toEqual(before);
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
    const reopenedAgain = new HostStore(state);
    expect(persistedState(reopenedAgain)).toEqual(before);
    expect(appliedMigrations(state)).toEqual(migrations.journal.entries.map((entry) => entry.when));
  });
});
