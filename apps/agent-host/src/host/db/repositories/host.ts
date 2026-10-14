import { sql } from "drizzle-orm";
import type { HostDatabaseOrm } from "../database";
import { hostTable } from "../schema";

export class HostRepository {
  private db: HostDatabaseOrm;

  constructor(db: HostDatabaseOrm) {
    this.db = db;
  }

  async serverSeq(): Promise<number> {
    const host = this.db.select().from(hostTable).get();

    if (!host) {
      throw new Error("Host row is missing");
    }

    return host.serverSeq;
  }

  async nextSequence(): Promise<number> {
    // The host table holds exactly one row.
    // oxlint-disable-next-line drizzle/enforce-update-with-where
    const updated = this.db
      .update(hostTable)
      .set({ serverSeq: sql`${hostTable.serverSeq} + 1` })
      .returning()
      .get();

    return updated.serverSeq;
  }
}
