import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./schema";
import migrations from "./migrations/migrations";
import { HostRepository } from "./repositories/host";
import { SessionsRepository } from "./repositories/sessions";

export type HostDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class HostDatabase {
  private orm: HostDatabaseOrm;
  private storage: DurableObjectStorage;
  readonly host: HostRepository;
  readonly sessions: SessionsRepository;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.orm = drizzle(storage, { schema, casing: "snake_case" });
    this.host = new HostRepository(this.orm);
    this.sessions = new SessionsRepository(this.orm);
  }

  migrate(): Promise<void> {
    return migrate(this.orm, migrations);
  }

  transaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.storage.transaction(operation);
  }
}
