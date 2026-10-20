import type { RouterDatabase } from "../db/database";
import { connectionTable } from "../db/schema";

/**
 * Allocates the `serverSeq` values of the actions that the router sends on the client
 * connection. The value is stored in router storage, so it resets when the connection closes.
 */
export class ServerSequence {
  private db: RouterDatabase;

  constructor(db: RouterDatabase) {
    this.db = db;
  }

  /**
   * Returns the last `serverSeq` sent to the client, or 0 before the first.
   */
  current(): number {
    const row = this.db.orm
      .select({ serverSeq: connectionTable.serverSeq })
      .from(connectionTable)
      .get();

    return row?.serverSeq ?? 0;
  }

  /**
   * Increments the serverSeq by `count`.
   * Returns the range of serverSeq increments.
   */
  increment(count: number): [number, number] {
    const current = this.current();
    const first = current + 1;
    const last = current + count;

    this.db.orm
      .insert(connectionTable)
      .values({ id: 1, serverSeq: last })
      .onConflictDoUpdate({ target: connectionTable.id, set: { serverSeq: last } })
      .run();

    return [first, last];
  }
}
