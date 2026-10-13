import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./schema";
import migrations from "./migrations/migrations";
import { SessionRepository } from "./repositories/session";

export class SessionDatabase {
  readonly orm: DrizzleSqliteDODatabase<typeof schema>;
  readonly session: SessionRepository;
  private readonly storage: DurableObjectStorage;

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
