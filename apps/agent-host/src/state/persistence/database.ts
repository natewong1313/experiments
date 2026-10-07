import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import drizzleMigrations from "../../../drizzle/migrations";
import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

class StateDatabase {
  readonly db: Database;
  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;
    this.db = drizzle(storage, { casing: "snake_case", schema });
  }

  async migrate(): Promise<void> {
    await migrate(this.db, drizzleMigrations);
  }

  transaction<T>(work: () => T): T {
    return this.storage.transactionSync(work);
  }
}

export { StateDatabase, type Database };
