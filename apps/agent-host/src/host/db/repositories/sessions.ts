import { eq } from "drizzle-orm";
import type { HostDatabaseOrm } from "../database";
import { sessionsTable } from "../schema";
import type { SessionEntry } from "../schema";
import type { SessionSummary } from "@experiments/protocol-schemas/ahp";

export class SessionsRepository {
  private db: HostDatabaseOrm;

  constructor(db: HostDatabaseOrm) {
    this.db = db;
  }

  async list(): Promise<SessionEntry[]> {
    return this.db.select().from(sessionsTable).all();
  }

  async count(): Promise<number> {
    return await this.db.$count(sessionsTable);
  }

  async get(id: string): Promise<SessionEntry | undefined> {
    return this.db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).get();
  }

  async findChat(id: string): Promise<SessionEntry | undefined> {
    return this.db.select().from(sessionsTable).where(eq(sessionsTable.defaultChatId, id)).get();
  }

  async create(entry: SessionEntry): Promise<void> {
    this.db.insert(sessionsTable).values(entry).run();
  }

  async update(id: string, summary: SessionSummary): Promise<void> {
    this.db.update(sessionsTable).set({ summary }).where(eq(sessionsTable.id, id)).run();
  }

  async remove(id: string): Promise<void> {
    this.db.delete(sessionsTable).where(eq(sessionsTable.id, id)).run();
  }
}
