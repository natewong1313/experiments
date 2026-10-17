import { sql } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import type { DurableObjectDatabase } from "../../shared/db/do-database";
import * as schema from "./schema";
import migrations from "./migrations/migrations";

export type SessionDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class SessionDatabase implements DurableObjectDatabase<typeof schema> {
  readonly orm: SessionDatabaseOrm;
  readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.orm = drizzle(storage, { schema, casing: "snake_case" });
  }

  /** Returns true if the session table exists. Reads without writing. */
  hasTables(): boolean {
    const tables = this.orm.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`,
    );

    return tables.length > 0;
  }

  migrate(): Promise<void> {
    return migrate(this.orm, migrations);
  }

  transactionSync<T>(operation: () => T): T {
    return this.storage.transactionSync(operation);
  }

  /** Deletes the alarm and all storage, including the tables. */
  async deleteAll(): Promise<void> {
    await this.storage.deleteAlarm();
    await this.storage.deleteAll();
  }
}
