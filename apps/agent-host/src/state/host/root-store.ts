import { eq, sql } from "drizzle-orm";
import type { RootState } from "@experiments/protocol-schemas/ahp";
import { hostTable } from "../persistence/schema";
import type { Database } from "../persistence/database";

const HOST_ID = 1;

export class RootStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  readRoot(): RootState {
    const row = this.db
      .select({ root: hostTable.root })
      .from(hostTable)
      .where(eq(hostTable.id, HOST_ID))
      .get();

    if (!row) {
      throw new Error("Host storage is not initialized");
    }

    return row.root;
  }

  writeRoot(root: RootState): void {
    this.db.update(hostTable).set({ root }).where(eq(hostTable.id, HOST_ID)).run();
  }

  rootBytes(): number {
    return (
      this.db
        .select({ bytes: sql<number>`LENGTH(CAST(${hostTable.root} AS BLOB))` })
        .from(hostTable)
        .where(eq(hostTable.id, HOST_ID))
        .get()?.bytes ?? 0
    );
  }
}
