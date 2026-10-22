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
   * Raises the stored serverSeq to `serverSeq` if the stored value is lower, and returns the
   * stored value. After `reconnect`, the next action must follow the `lastSeenServerSeq` of the
   * client.
   */
  advanceTo(serverSeq: number): number {
    const last = Math.max(this.current(), serverSeq);

    this.store(last);

    return last;
  }

  /**
   * Increments the serverSeq by `count`.
   * Returns the range of serverSeq increments.
   */
  increment(count: number): [number, number] {
    const current = this.current();
    const first = current + 1;
    const last = current + count;

    this.store(last);

    return [first, last];
  }

  private store(serverSeq: number): void {
    this.db.orm
      .insert(connectionTable)
      .values({ id: 1, serverSeq })
      .onConflictDoUpdate({ target: connectionTable.id, set: { serverSeq } })
      .run();
  }
}
