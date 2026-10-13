import { eq } from "drizzle-orm";
import type { SessionDatabase } from "../database";
import { sessionTable } from "../schema";
import type { SessionRecord, SessionRecordInsert } from "../schema";

export class SessionRepository {
  private readonly db: SessionDatabase["orm"];

  constructor(db: SessionDatabase["orm"]) {
    this.db = db;
  }

  get(): SessionRecord | undefined {
    return this.db.select().from(sessionTable).get();
  }

  create(record: SessionRecordInsert): void {
    this.db.insert(sessionTable).values(record).run();
  }

  save(record: SessionRecord): void {
    this.db.update(sessionTable).set(record).where(eq(sessionTable.id, record.id)).run();
  }

  remove(id: string): void {
    this.db.delete(sessionTable).where(eq(sessionTable.id, id)).run();
  }
}
