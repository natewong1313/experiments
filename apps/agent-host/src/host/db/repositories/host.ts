import { eq, sql } from "drizzle-orm";
import type { HostDatabaseOrm } from "../database";
import { hostTable } from "../schema";
import type { HostEntry } from "../schema";

export class HostRepository {
  private db: HostDatabaseOrm;

  constructor(db: HostDatabaseOrm) {
    this.db = db;
  }

  async get(): Promise<HostEntry | undefined> {
    return this.db.select().from(hostTable).get();
  }

  async initialize(id: string): Promise<void> {
    this.db.insert(hostTable).values({ id }).onConflictDoNothing().run();
  }

  async nextSequence(): Promise<number> {
    const current = await this.get();

    if (!current) {
      throw new Error("Host has not been initialized");
    }

    const updated = this.db
      .update(hostTable)
      .set({ serverSeq: sql`${hostTable.serverSeq} + 1` })
      .where(eq(hostTable.id, current.id))
      .returning()
      .get();

    return updated.serverSeq;
  }
}
