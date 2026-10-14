import { eq } from "drizzle-orm";
import type { SessionDatabaseOrm } from "../database";
import { sessionTable } from "../schema";
import type { SessionRecord, SessionRecordInsert } from "../schema";

// The table holds at most one row: the session owned by this Durable Object.
export class SessionRepository {
  private db: SessionDatabaseOrm;

  constructor(db: SessionDatabaseOrm) {
    this.db = db;
  }

  async get(): Promise<SessionRecord | undefined> {
    return this.db.select().from(sessionTable).get();
  }

  async create(record: SessionRecordInsert): Promise<void> {
    this.db.insert(sessionTable).values(record).run();
  }

  /**
   * Reads, changes, and writes the record without yielding, so concurrent changes cannot interleave.
   * `change` mutates the record and returns a result; returning undefined skips the write.
   * Returns undefined when the session does not exist.
   */
  update<T>(change: (record: SessionRecord) => T | undefined): T | undefined {
    const record = this.db.select().from(sessionTable).get();

    if (!record) {
      return undefined;
    }

    const result = change(record);

    if (result !== undefined) {
      this.db.update(sessionTable).set(record).where(eq(sessionTable.id, record.id)).run();
    }

    return result;
  }

  async setAcpSessionId(id: string, acpSessionId: string): Promise<void> {
    this.db.update(sessionTable).set({ acpSessionId }).where(eq(sessionTable.id, id)).run();
  }

  async remove(): Promise<void> {
    // oxlint-disable-next-line drizzle/enforce-delete-with-where -- removes the only session row
    this.db.delete(sessionTable).run();
  }
}
