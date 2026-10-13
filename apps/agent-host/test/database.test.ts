import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { HostDatabase } from "../src/host/db/database";
import { SessionDatabase } from "../src/session/db/database";
import { initialRecord } from "../src/session/state";
import type { SessionRecord } from "../src/session/db/schema";
import { sessionKey } from "../src/protocol";

function record(hostId: string): SessionRecord {
  return initialRecord(
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

    const entry = {
      id: session.id,
      defaultChatId: session.chatState.resource.slice("ahp-chat:/".length),
      summary: session.summary,
    };

    const result = database.transactionSync(() => {
      host.initialize(hostId);
      sessions.create(entry);

      return entry.id;
    });

    expect(result).toBe(entry.id);
    expect(sessions.get(entry.id)).toEqual(entry);

    function abort(): never {
      sessions.remove(entry.id);
      host.nextSequence();
      throw new Error("Abort host writes");
    }

    expect(() => database.transactionSync(abort)).toThrow("Abort host writes");
    expect(host.get()?.serverSeq).toBe(0);
    expect(sessions.get(entry.id)).toEqual(entry);
  });
});

it("commits and rolls back session repository writes", async () => {
  const hostId = crypto.randomUUID();
  const session = record(hostId);
  const stub = env.CONVERSATIONS.getByName(sessionKey(hostId, session.id));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const database = new SessionDatabase(ctx.storage);
    await database.migrate();
    const { session: sessions } = database;

    const result = database.transactionSync(() => {
      sessions.create(session);

      return session.id;
    });

    expect(result).toBe(session.id);
    expect(sessions.get()).toEqual(session);

    function abort(): never {
      sessions.save({ ...session, revision: 1 });
      sessions.remove(session.id);
      throw new Error("Abort session writes");
    }

    expect(() => database.transactionSync(abort)).toThrow("Abort session writes");
    expect(sessions.get()).toEqual(session);
  });
});
