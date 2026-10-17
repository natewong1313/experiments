import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import type { DurableObjectDatabase } from "../../shared/db/do-database";
import * as schema from "./schema";
import migrations from "./migrations/migrations";

export type HostDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class HostDatabase implements DurableObjectDatabase<typeof schema> {
  readonly orm: HostDatabaseOrm;
  readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.orm = drizzle(storage, { schema, casing: "snake_case" });
  }

  migrate(): Promise<void> {
    return migrate(this.orm, migrations);
  }

  transactionSync<T>(operation: () => T): T {
    return this.storage.transactionSync(operation);
  }
}
