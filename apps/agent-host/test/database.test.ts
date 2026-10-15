import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { HostDatabase } from "../src/host/db/database";
import { hostTable, sessionsTable } from "../src/host/db/schema";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import { buildSession, sessionSummary } from "../src/session/state";
import type { SessionRecord } from "../src/session/db/schema";
import { sessionDOName } from "../src/shared/lookups";

const EXPECTED_SEQUENCE_COUNT = 2;

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

it("commits and rolls back host writes", async () => {
  const hostId = crypto.randomUUID();
  const session = record(hostId);

  await runInDurableObject(env.COORDINATORS.getByName(hostId), async (_instance, ctx) => {
    const database = new HostDatabase(ctx.storage);
    await database.migrate();
    const { orm } = database;

    function serverSeq(): number {
      return orm.select({ serverSeq: hostTable.serverSeq }).from(hostTable).get()?.serverSeq ?? 0;
    }

    function nextServerSeq(): number {
      const { serverSeq: seq } = orm
        .insert(hostTable)
        .values({ id: 1, serverSeq: 1 })
        .onConflictDoUpdate({
          target: hostTable.id,
          set: { serverSeq: sql`${hostTable.serverSeq} + 1` },
        })
        .returning({ serverSeq: hostTable.serverSeq })
        .get();

      return seq;
    }

    expect(serverSeq()).toBe(0);

    const entry = {
      id: session.id,
      revision: 0,
      defaultChatId: session.chatState.resource.slice("ahp-chat:/".length),
      summary: sessionSummary(session),
    };

    const result = await ctx.storage.transaction(async () => {
      orm.insert(sessionsTable).values(entry).run();

      return entry.id;
    });

    expect(result).toBe(entry.id);

    const all = orm.select().from(sessionsTable).all();
    expect(all).toEqual([entry]);
    expect(await orm.$count(sessionsTable)).toBe(1);

    const byChat = orm
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.defaultChatId, entry.defaultChatId))
      .get();

    expect(byChat).toEqual(entry);
    expect(() => orm.insert(sessionsTable).values(entry).run()).toThrow(Error);

    const byId = orm.select().from(sessionsTable).where(eq(sessionsTable.id, entry.id)).get();
    expect(byId).toEqual(entry);

    function abort(): never {
      orm.delete(sessionsTable).where(eq(sessionsTable.id, entry.id)).run();
      nextServerSeq();
      throw new Error("Abort host writes");
    }

    await expect(ctx.storage.transaction(abort)).rejects.toThrow("Abort host writes");
    expect(serverSeq()).toBe(0);

    const afterAbort = orm.select().from(sessionsTable).where(eq(sessionsTable.id, entry.id)).get();
    expect(afterAbort).toEqual(entry);

    const sequences = [nextServerSeq(), nextServerSeq()];
    expect(sequences).toEqual([1, EXPECTED_SEQUENCE_COUNT]);
    expect(serverSeq()).toBe(EXPECTED_SEQUENCE_COUNT);

    const summary = { ...entry.summary, title: "Updated session" };
    orm
      .update(sessionsTable)
      .set({ summary, revision: entry.revision })
      .where(eq(sessionsTable.id, entry.id))
      .run();

    const updated = orm.select().from(sessionsTable).where(eq(sessionsTable.id, entry.id)).get();
    expect(updated?.summary).toEqual(summary);

    orm.delete(sessionsTable).where(eq(sessionsTable.id, entry.id)).run();

    const remaining = orm.select().from(sessionsTable).all();
    expect(remaining).toEqual([]);

    const deleted = orm.select().from(sessionsTable).where(eq(sessionsTable.id, entry.id)).get();
    expect(deleted).toBeUndefined();

    const deletedByChat = orm
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.defaultChatId, entry.defaultChatId))
      .get();

    expect(deletedByChat).toBeUndefined();
  });
});

it("commits and rolls back session writes", async () => {
  const hostId = crypto.randomUUID();
  const session = record(hostId);
  const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.id));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const database = new SessionDatabase(ctx.storage);
    await database.migrate();
    const { orm } = database;
    expect(orm.select().from(sessionTable).get()).toBeUndefined();

    const result = await database.transaction(async () => {
      orm.insert(sessionTable).values(session).run();

      return session.id;
    });

    expect(result).toBe(session.id);
    expect(orm.select().from(sessionTable).get()).toEqual(session);
    await expect(
      database.transaction(async () => orm.insert(sessionTable).values(session).run()),
    ).rejects.toBeInstanceOf(Error);

    async function abort(): Promise<never> {
      orm
        .update(sessionTable)
        .set({ ...session, revision: 1 })
        .where(eq(sessionTable.id, session.id))
        .run();
      // oxlint-disable-next-line drizzle/enforce-delete-with-where -- removes the only session row
      orm.delete(sessionTable).run();
      throw new Error("Abort session writes");
    }

    await expect(database.transaction(abort)).rejects.toThrow("Abort session writes");
    expect(orm.select().from(sessionTable).get()).toEqual(session);

    orm
      .update(sessionTable)
      .set({ ...session, revision: 1 })
      .where(eq(sessionTable.id, session.id))
      .run();
    expect(orm.select().from(sessionTable).get()).toEqual({ ...session, revision: 1 });
    orm
      .update(sessionTable)
      .set({ acpSessionId: "acp-session" })
      .where(eq(sessionTable.id, session.id))
      .run();
    expect(orm.select().from(sessionTable).get()).toMatchObject({ acpSessionId: "acp-session" });
    // oxlint-disable-next-line drizzle/enforce-delete-with-where -- removes the only session row
    orm.delete(sessionTable).run();
    expect(orm.select().from(sessionTable).get()).toBeUndefined();
  });
});
