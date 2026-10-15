import { sql } from "drizzle-orm";
import type { HostDatabaseOrm } from "../database";
import { hostTable } from "../schema";

export class HostRepository {
  private db: HostDatabaseOrm;

  constructor(db: HostDatabaseOrm) {
    this.db = db;
  }

  /** The last allocated server sequence, or 0 before the first allocation. */
  async serverSeq(): Promise<number> {
    return this.db.select().from(hostTable).get()?.serverSeq ?? 0;
  }

  nextServerSeq(): number {
    const { serverSeq } = this.db
      .insert(hostTable)
      .values({ id: 1, serverSeq: 1 })
      .onConflictDoUpdate({
        target: hostTable.id,
        set: { serverSeq: sql`${hostTable.serverSeq} + 1` },
      })
      .returning()
      .get();

    return serverSeq;
  }
}
