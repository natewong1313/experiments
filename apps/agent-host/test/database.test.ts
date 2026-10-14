import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { HostDatabase } from "../src/host/db/database";
import { SessionDatabase } from "../src/session/db/database";
import { buildSession } from "../src/session/state";
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
    expect(await host.get()).toBeUndefined();
    await expect(host.nextSequence()).rejects.toThrow("Host has not been initialized");

    const entry = {
      id: session.id,
      defaultChatId: session.chatState.resource.slice("ahp-chat:/".length),
      summary: session.summary,
    };

    const result = await database.transaction(async () => {
      await host.initialize(hostId);
      await sessions.create(entry);

      return entry.id;
    });

    expect(result).toBe(entry.id);
    await host.initialize(crypto.randomUUID());
    const initialized = await host.get();
    expect(initialized?.id).toBe(hostId);
    expect(await sessions.list()).toEqual([entry]);
    expect(await sessions.findChat(entry.defaultChatId)).toEqual(entry);
    await expect(sessions.create(entry)).rejects.toBeInstanceOf(Error);
    expect(await sessions.get(entry.id)).toEqual(entry);

    async function abort(): Promise<never> {
      await sessions.remove(entry.id);
      await host.nextSequence();
      throw new Error("Abort host writes");
    }

    await expect(database.transaction(abort)).rejects.toThrow("Abort host writes");
    const rolledBack = await host.get();
    expect(rolledBack?.serverSeq).toBe(0);
    expect(await sessions.get(entry.id)).toEqual(entry);

    const sequences = await Promise.all([host.nextSequence(), host.nextSequence()]);
    expect(sequences).toEqual([1, EXPECTED_SEQUENCE_COUNT]);
    const sequenced = await host.get();
    expect(sequenced?.serverSeq).toBe(EXPECTED_SEQUENCE_COUNT);

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
      await sessions.save({ ...session, revision: 1 });
      await sessions.remove(session.id);
      throw new Error("Abort session writes");
    }

    await expect(database.transaction(abort)).rejects.toThrow("Abort session writes");
    expect(await sessions.get()).toEqual(session);

    const updated = { ...session, revision: 1 };
    await sessions.save(updated);
    expect(await sessions.get()).toEqual(updated);
    await sessions.remove(session.id);
    expect(await sessions.get()).toBeUndefined();
  });
});
