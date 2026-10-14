import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { HostDatabase } from "../src/host/db/database";
import migrations from "../src/host/db/migrations/migrations";
import { SessionDatabase } from "../src/session/db/database";
import { buildSession, sessionSummary } from "../src/session/state";
import type { SessionRecord } from "../src/session/db/schema";
import { sessionDOName } from "../src/shared/lookups";

const EXPECTED_SEQUENCE_COUNT = 2;
const UPGRADED_SEQUENCE = 7;

function record(hostId: string): SessionRecord {
  return buildSession(
    {
      hostId,
      sessionId: crypto.randomUUID(),
      chatId: crypto.randomUUID(),
      provider: "test",
      createdAt: new Date().toISOString(),
    },
    "/",
  );
}

it("commits and rolls back host writes across repositories", async () => {
  const hostId = crypto.randomUUID();
  const session = record(hostId);

  await runInDurableObject(env.COORDINATORS.getByName(hostId), async (_instance, ctx) => {
    const database = new HostDatabase(ctx.storage);
    await database.migrate();
    const { host, sessions } = database;
    expect(await host.serverSeq()).toBe(0);

    const entry = {
      id: session.id,
      defaultChatId: session.chatState.resource.slice("ahp-chat:/".length),
      summary: sessionSummary(session),
    };

    const result = await ctx.storage.transaction(async () => {
      await sessions.create(entry);

      return entry.id;
    });

    expect(result).toBe(entry.id);
    expect(await sessions.list()).toEqual([entry]);
    expect(await sessions.count()).toBe(1);
    expect(await sessions.findChat(entry.defaultChatId)).toEqual(entry);
    await expect(sessions.create(entry)).rejects.toBeInstanceOf(Error);
    expect(await sessions.get(entry.id)).toEqual(entry);

    async function abort(): Promise<never> {
      await sessions.remove(entry.id);
      await host.nextSequence();
      throw new Error("Abort host writes");
    }

    await expect(ctx.storage.transaction(abort)).rejects.toThrow("Abort host writes");
    expect(await host.serverSeq()).toBe(0);
    expect(await sessions.get(entry.id)).toEqual(entry);

    const sequences = await Promise.all([host.nextSequence(), host.nextSequence()]);
    expect(sequences).toEqual([1, EXPECTED_SEQUENCE_COUNT]);
    expect(await host.serverSeq()).toBe(EXPECTED_SEQUENCE_COUNT);

    const summary = { ...entry.summary, title: "Updated session" };
    await sessions.update(entry.id, summary);
    const updated = await sessions.get(entry.id);
    expect(updated?.summary).toEqual(summary);
    await sessions.remove(entry.id);
    expect(await sessions.list()).toEqual([]);
    expect(await sessions.get(entry.id)).toBeUndefined();
    expect(await sessions.findChat(entry.defaultChatId)).toBeUndefined();
  });
});

it("keeps the server sequence when upgrading to the singleton host table", async () => {
  const hostId = crypto.randomUUID();

  await runInDurableObject(env.COORDINATORS.getByName(hostId), async (_instance, ctx) => {
    const orm = drizzle(ctx.storage);

    for (const table of ["host", "sessions", "__drizzle_migrations"]) {
      orm.run(sql`DROP TABLE ${sql.identifier(table)}`);
    }

    const { m0000 } = migrations.migrations;

    if (m0000 === undefined) {
      throw new Error("Missing the initial host migration");
    }

    await migrate(orm, {
      journal: { ...migrations.journal, entries: migrations.journal.entries.slice(0, 1) },
      migrations: { m0000 },
    });

    orm.run(sql`INSERT INTO host (id, server_seq) VALUES (${hostId}, ${UPGRADED_SEQUENCE})`);
    const database = new HostDatabase(ctx.storage);
    await database.migrate();
    expect(orm.all(sql`SELECT * FROM host`)).toEqual([{ server_seq: UPGRADED_SEQUENCE }]);
    expect(await database.host.nextSequence()).toBe(UPGRADED_SEQUENCE + 1);
  });
});

it("commits and rolls back session repository writes", async () => {
  const hostId = crypto.randomUUID();
  const session = record(hostId);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.id));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const database = new SessionDatabase(ctx.storage);
    await database.migrate();
    const { session: sessions } = database;
    expect(await sessions.get()).toBeUndefined();

    const result = await database.transaction(async () => {
      await sessions.create(session);

      return session.id;
    });

    expect(result).toBe(session.id);
    expect(await sessions.get()).toEqual(session);
    await expect(sessions.create(session)).rejects.toBeInstanceOf(Error);

    async function abort(): Promise<never> {
      sessions.update((current) => {
        current.revision = 1;

        return current;
      });
      await sessions.remove();
      throw new Error("Abort session writes");
    }

    await expect(database.transaction(abort)).rejects.toThrow("Abort session writes");
    expect(await sessions.get()).toEqual(session);

    const skipped = sessions.update((current): number | undefined => {
      current.revision = 1;

      return undefined;
    });

    expect(skipped).toBeUndefined();
    expect(await sessions.get()).toEqual(session);

    expect(sessions.update((current) => ++current.revision)).toBe(1);
    expect(await sessions.get()).toEqual({ ...session, revision: 1 });
    await sessions.setAcpSessionId(session.id, "acp-session");
    expect(await sessions.get()).toMatchObject({ acpSessionId: "acp-session" });
    await sessions.remove();
    expect(await sessions.get()).toBeUndefined();
    expect(sessions.update((current) => current.id)).toBeUndefined();
  });
});
