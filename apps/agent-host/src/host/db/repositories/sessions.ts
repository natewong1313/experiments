import { eq } from "drizzle-orm";
import type { HostDatabaseOrm } from "../database";
import { sessionsTable } from "../schema";
import type { SessionEntry } from "../schema";
import type { SessionSummaryData } from "../../../types";

export class SessionsRepository {
  private db: HostDatabaseOrm;

  constructor(db: HostDatabaseOrm) {
    this.db = db;
  }

  list(): SessionEntry[] {
    return this.db.select().from(sessionsTable).all();
  }

  get(id: string): SessionEntry | undefined {
    return this.db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).get();
  }

  findChat(id: string): SessionEntry | undefined {
    return this.db.select().from(sessionsTable).where(eq(sessionsTable.defaultChatId, id)).get();
  }

  create(entry: SessionEntry): void {
    this.db.insert(sessionsTable).values(entry).run();
  }

  update(id: string, summary: SessionSummaryData): void {
    this.db.update(sessionsTable).set({ summary }).where(eq(sessionsTable.id, id)).run();
  }

  remove(id: string): void {
    this.db.delete(sessionsTable).where(eq(sessionsTable.id, id)).run();
  }
}
