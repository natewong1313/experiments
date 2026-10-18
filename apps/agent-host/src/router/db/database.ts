import { sql } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import type { DurableObjectDatabase } from "../../shared/db/do-database";
import * as schema from "./schema";
import migrations from "./migrations/migrations";

export type RouterDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class RouterDatabase implements DurableObjectDatabase<typeof schema> {
  readonly orm: RouterDatabaseOrm;
  readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.orm = drizzle(storage, { schema, casing: "snake_case" });
  }

  /** Returns true if the router tables exist. Reads without writing. */
  hasMigrated(): boolean {
    const tables = this.orm.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'senders'`,
    );

    return tables.length > 0;
  }

  migrate(): Promise<void> {
    return migrate(this.orm, migrations);
  }

  transactionSync<T>(operation: () => T): T {
    return this.storage.transactionSync(operation);
  }

  /** Deletes all storage, including the tables. */
  async deleteAll(): Promise<void> {
    await this.storage.deleteAll();
  }
}
