import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./schema";
import migrations from "./migrations/migrations";
import { SessionRepository } from "./repositories/session";

export type SessionDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class SessionDatabase {
  private orm: DrizzleSqliteDODatabase<typeof schema>;
  private storage: DurableObjectStorage;
  readonly session: SessionRepository;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.orm = drizzle(storage, { schema, casing: "snake_case" });
    this.session = new SessionRepository(this.orm);
  }

  migrate(): Promise<void> {
    return migrate(this.orm, migrations);
  }

  transactionSync<T>(operation: () => T): T {
    return this.storage.transactionSync(operation);
  }
}
