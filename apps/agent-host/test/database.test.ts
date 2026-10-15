import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { HostDatabase } from "../src/host/db/database";
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
      revision: 0,
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
    expect(sessions.get(entry.id)).toEqual(entry);

    async function abort(): Promise<never> {
      await sessions.remove(entry.id);
      host.nextServerSeq();
      throw new Error("Abort host writes");
    }

    await expect(ctx.storage.transaction(abort)).rejects.toThrow("Abort host writes");
    expect(await host.serverSeq()).toBe(0);
    expect(sessions.get(entry.id)).toEqual(entry);

    const sequences = [host.nextServerSeq(), host.nextServerSeq()];
    expect(sequences).toEqual([1, EXPECTED_SEQUENCE_COUNT]);
    expect(await host.serverSeq()).toBe(EXPECTED_SEQUENCE_COUNT);

    const summary = { ...entry.summary, title: "Updated session" };
    sessions.update({ ...entry, summary });
    const updated = sessions.get(entry.id);
    expect(updated?.summary).toEqual(summary);
    await sessions.remove(entry.id);
    expect(await sessions.list()).toEqual([]);
    expect(sessions.get(entry.id)).toBeUndefined();
    expect(await sessions.findChat(entry.defaultChatId)).toBeUndefined();
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
