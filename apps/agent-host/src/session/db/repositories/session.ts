import { eq } from "drizzle-orm";
import type { SessionDatabaseOrm } from "../database";
import { sessionTable } from "../schema";
import type { SessionRecord, SessionRecordInsert } from "../schema";

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

  async save(record: SessionRecord): Promise<void> {
    this.db.update(sessionTable).set(record).where(eq(sessionTable.id, record.id)).run();
  }

  async remove(id: string): Promise<void> {
    this.db.delete(sessionTable).where(eq(sessionTable.id, id)).run();
  }
}
