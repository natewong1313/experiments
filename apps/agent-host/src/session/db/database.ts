import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as schema from "./schema";
import migrations from "./migrations/migrations";
import { SessionRepository } from "./repositories/session";
import { HostUpdatesRepository } from "./repositories/host-updates";

export type SessionDatabaseOrm = DrizzleSqliteDODatabase<typeof schema>;

export class SessionDatabase {
  private orm: DrizzleSqliteDODatabase<typeof schema>;
  private storage: DurableObjectStorage;
  readonly session: SessionRepository;
  readonly hostUpdates: HostUpdatesRepository;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.orm = drizzle(storage, { schema, casing: "snake_case" });
    this.session = new SessionRepository(this.orm);
    this.hostUpdates = new HostUpdatesRepository(this.orm);
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
