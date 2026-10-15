import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./schema";
import migrations from "./migrations/migrations";

export type HostDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class HostDatabase {
  readonly orm: HostDatabaseOrm;
  private storage: DurableObjectStorage;

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
