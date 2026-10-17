import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

// oxlint-disable-next-line typescript/consistent-type-definitions -- Database classes implement this shared interface.
export interface DurableObjectDatabase<
  TSchema extends Record<string, unknown> = Record<string, SQLiteTable>,
> {
  readonly orm: DrizzleSqliteDODatabase<TSchema>;
  readonly storage: DurableObjectStorage;
}
