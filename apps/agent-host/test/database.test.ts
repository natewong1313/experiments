import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import { HostDatabase } from "../src/host/db/database";
import { rootTable, sessionsTable } from "../src/host/db/schema";
import { RouterDatabase } from "../src/router/db/database";
import migrations from "../src/router/db/migrations/migrations";
import {
  connectionTable,
  sendersTable,
  subscriptionSetupTable,
  subscriptionsTable,
} from "../src/router/db/schema";
import { SessionDatabase } from "../src/session/db/database";
import { sessionTable } from "../src/session/db/schema";
import { newEntry, newRecord } from "./fixtures";
import { newRouterDOName, sessionDOName } from "../src/shared/lookups";

it("commits and rolls back host writes", async () => {
  const hostId = crypto.randomUUID();
  const { sessionId: id, defaultChat, summary } = newEntry();

  await runInDurableObject(env.COORDINATORS.getByName(hostId), async (_instance, ctx) => {
    const database = new HostDatabase(ctx.storage);
    await database.migrate();
    const { orm } = database;

    function revision(): number {
      return orm.select({ revision: rootTable.revision }).from(rootTable).get()?.revision ?? 0;
    }

    const entry = { id, revision: 0, defaultChat, summary };

    database.transactionSync(() => {
      orm.insert(sessionsTable).values(entry).run();
      orm.insert(rootTable).values({ id: 1, revision: 1 }).run();
    });

    expect(orm.select().from(sessionsTable).all()).toEqual([entry]);
    expect(revision()).toBe(1);
    expect(() => orm.insert(sessionsTable).values(entry).run()).toThrow(Error);

    function abort(): never {
      orm.delete(sessionsTable).where(eq(sessionsTable.id, entry.id)).run();
      orm.update(rootTable).set({ revision: 2 }).where(eq(rootTable.id, 1)).run();
      throw new Error("Abort host writes");
    }

    expect(() => database.transactionSync(abort)).toThrow("Abort host writes");
    expect(orm.select().from(sessionsTable).all()).toEqual([entry]);
    expect(revision()).toBe(1);
    expect(() => orm.insert(rootTable).values({ id: 2, revision: 0 }).run()).toThrow(Error);
  });
});

it("commits and rolls back session writes and creates no tables before a session exists", async () => {
  const hostId = crypto.randomUUID();
  const { session } = newRecord();
  const stub = env.CONVERSATIONS.getByName(sessionDOName(hostId, session.id));

  await runInDurableObject(stub, async (_instance, ctx) => {
    const database = new SessionDatabase(ctx.storage);
    expect(database.hasMigrated()).toBe(false);
    await database.migrate();
    expect(database.hasMigrated()).toBe(true);
    const { orm } = database;
    expect(orm.select().from(sessionTable).get()).toBeUndefined();

    database.transactionSync(() => {
      orm.insert(sessionTable).values(session).run();
    });

    expect(orm.select().from(sessionTable).get()).toEqual(session);
    expect(() => orm.insert(sessionTable).values(session).run()).toThrow(Error);

    function abort(): never {
      orm
        .update(sessionTable)
        .set({ ...session, revision: 1 })
        .where(eq(sessionTable.id, session.id))
        .run();
      throw new Error("Abort session writes");
    }

    expect(() => database.transactionSync(abort)).toThrow("Abort session writes");
    expect(orm.select().from(sessionTable).get()).toEqual(session);

    await database.deleteAll();
    expect(database.hasMigrated()).toBe(false);
  });
});

it("commits and rolls back router writes", async () => {
  const router = newRouterDOName(crypto.randomUUID());
  const stub = env.CONNECTIONS.getByName(router);

  await runInDurableObject(stub, async (_instance, ctx) => {
    const database = new RouterDatabase(ctx.storage);
    await database.migrate();
    const { orm } = database;
    const source = crypto.randomUUID();
    const channel = `ahp-session:/${source}`;

    database.transactionSync(() => {
      orm.insert(sendersTable).values({ id: source, revision: 1 }).run();
      orm.insert(subscriptionsTable).values({ channel, sender: source, revision: 1 }).run();
      orm.insert(connectionTable).values({ id: 1, serverSeq: 1 }).run();
    });

    function abort(): never {
      orm.delete(subscriptionsTable).where(eq(subscriptionsTable.channel, channel)).run();
      orm.update(connectionTable).set({ serverSeq: 2 }).where(eq(connectionTable.id, 1)).run();
      throw new Error("Abort router writes");
    }

    expect(() => database.transactionSync(abort)).toThrow("Abort router writes");
    expect(orm.select().from(subscriptionsTable).all()).toEqual([
      { channel, sender: source, revision: 1 },
    ]);
    expect(orm.select().from(connectionTable).get()).toEqual({ id: 1, serverSeq: 1 });
    expect(() => orm.insert(connectionTable).values({ id: 2, serverSeq: 0 }).run()).toThrow(Error);
  });
});

it("migrates the root sender key to the host key", async () => {
  const router = newRouterDOName(crypto.randomUUID());
  const stub = env.CONNECTIONS.getByName(router);

  await runInDurableObject(stub, async (_instance, ctx) => {
    const database = new RouterDatabase(ctx.storage);
    const { orm } = database;
    const [first] = migrations.journal.entries;
    const sessionId = crypto.randomUUID();
    const channel = `ahp-session:/${sessionId}`;

    await migrate(orm, {
      journal: { entries: first ? [first] : [] },
      migrations: { m0000: migrations.migrations.m0000 ?? "" },
    });
    orm.run(sql`INSERT INTO senders (id, revision) VALUES ('root', 1), (${sessionId}, 2)`);
    orm.run(
      sql`INSERT INTO subscriptions (channel, sender, revision) VALUES ('ahp-root://', 'root', 1), (${channel}, ${sessionId}, 2)`,
    );
    await database.migrate();

    expect(orm.select().from(sendersTable).all()).toEqual([
      { id: "host", revision: 1 },
      { id: sessionId, revision: 2 },
    ]);
    expect(orm.select().from(subscriptionsTable).all()).toEqual([
      { channel: "ahp-root://", sender: "host", revision: 1 },
      { channel, sender: sessionId, revision: 2 },
    ]);
    expect(orm.select().from(subscriptionSetupTable).all()).toEqual([]);
    expect(() => orm.insert(subscriptionSetupTable).values({ id: 2 }).run()).toThrow(Error);
  });
});
