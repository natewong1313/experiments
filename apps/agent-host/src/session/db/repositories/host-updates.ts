import { asc, eq } from "drizzle-orm";
import type { SessionDatabaseOrm } from "../database";
import { hostUpdatesTable } from "../schema";
import type { PendingHostUpdate } from "../schema";

export class HostUpdatesRepository {
  private db: SessionDatabaseOrm;

  constructor(db: SessionDatabaseOrm) {
    this.db = db;
  }

  add(update: Pick<PendingHostUpdate, "hostId" | "update" | "retryAt">): number {
    return this.db.insert(hostUpdatesTable).values(update).returning().get().id;
  }

  first(): PendingHostUpdate | undefined {
    return this.db.select().from(hostUpdatesTable).orderBy(asc(hostUpdatesTable.id)).get();
  }

  attempt(id: number, attempts: number, retryAt: number): void {
    this.db
      .update(hostUpdatesTable)
      .set({ attempts, retryAt })
      .where(eq(hostUpdatesTable.id, id))
      .run();
  }

  fail(id: number, error: string, retryAt: number | null): void {
    this.db
      .update(hostUpdatesTable)
      .set({ error, retryAt })
      .where(eq(hostUpdatesTable.id, id))
      .run();
  }

  remove(id: number): void {
    this.db.delete(hostUpdatesTable).where(eq(hostUpdatesTable.id, id)).run();
  }

  clear(): void {
    // oxlint-disable-next-line drizzle/enforce-delete-with-where -- removes all updates owned by the disposed session
    this.db.delete(hostUpdatesTable).run();
  }
}
