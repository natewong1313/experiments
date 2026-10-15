import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./schema";
import migrations from "./migrations/migrations";

export type SessionDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class SessionDatabase {
  readonly orm: SessionDatabaseOrm;
  private storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.orm = drizzle(storage, { schema, casing: "snake_case" });
  }

  migrate(): Promise<void> {
    return migrate(this.orm, migrations);
  }

  transaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.storage.transaction(operation);
  }

  setAlarm(time: number): Promise<void> {
    return this.storage.setAlarm(time);
  }

  deleteAlarm(): Promise<void> {
    return this.storage.deleteAlarm();
  }
}
