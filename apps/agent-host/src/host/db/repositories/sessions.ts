import { eq } from "drizzle-orm";
import type { HostDatabaseOrm } from "../database";
import { sessionsTable } from "../schema";
import type { SessionEntry, SessionEntryInsert } from "../schema";
import type { SessionSummary as AHPSessionSummary } from "@experiments/protocol-schemas/ahp";

export class SessionsRepository {
  private db: HostDatabaseOrm;

  constructor(db: HostDatabaseOrm) {
    this.db = db;
  }

  async list(): Promise<SessionEntry[]> {
    return this.db.select().from(sessionsTable).all();
  }

  async listSummaries(): Promise<AHPSessionSummary[]> {
    const rows = this.db.select({ summary: sessionsTable.summary }).from(sessionsTable).all();

    return rows.map((row) => row.summary);
  }

  async count(): Promise<number> {
    return await this.db.$count(sessionsTable);
  }

  get(id: string): SessionEntry | undefined {
    return this.db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).get();
  }

  async findChat(id: string): Promise<SessionEntry | undefined> {
    return this.db.select().from(sessionsTable).where(eq(sessionsTable.defaultChatId, id)).get();
  }

  async create(entry: SessionEntryInsert): Promise<void> {
    this.db.insert(sessionsTable).values(entry).run();
  }

  update(entry: Pick<SessionEntry, "id" | "summary" | "revision">): void {
    this.db
      .update(sessionsTable)
      .set({ summary: entry.summary, revision: entry.revision })
      .where(eq(sessionsTable.id, entry.id))
      .run();
  }

  async remove(id: string): Promise<void> {
    this.db.delete(sessionsTable).where(eq(sessionsTable.id, id)).run();
  }
}
