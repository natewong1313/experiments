import { asc, count, eq, gt, or, sql } from "drizzle-orm";
import type { SessionState } from "@experiments/protocol-schemas/ahp";
import { sessionsTable } from "../persistence/schema";
import { checkBytes } from "../../memory";
import type { Database } from "../persistence/database";
import type { SessionRecord } from "../records";

const MAX_SESSION_BYTES = 65_536;

type SessionCandidatesParams = { cursor?: string; limit: number };

class SessionStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  lookupSession(channel: string): SessionRecord | undefined {
    const match = or(eq(sessionsTable.uri, channel), eq(sessionsTable.chatUri, channel));

    return this.db.select().from(sessionsTable).where(match).get();
  }

  hasSessionChannel(channel: string): boolean {
    const match = or(eq(sessionsTable.uri, channel), eq(sessionsTable.chatUri, channel));

    return (
      this.db.select({ uri: sessionsTable.uri }).from(sessionsTable).where(match).get() !== void 0
    );
  }

  hasSession(uri: string): boolean {
    return (
      this.db
        .select({ uri: sessionsTable.uri })
        .from(sessionsTable)
        .where(eq(sessionsTable.uri, uri))
        .get() !== void 0
    );
  }

  hasChat(uri: string): boolean {
    return (
      this.db
        .select({ uri: sessionsTable.uri })
        .from(sessionsTable)
        .where(eq(sessionsTable.chatUri, uri))
        .get() !== void 0
    );
  }

  recoverableSessionUris(activeStatus: number): { uri: string }[] {
    return this.db
      .select({ uri: sessionsTable.uri })
      .from(sessionsTable)
      .where(
        or(
          sql`json_extract(${sessionsTable.session}, '$.lifecycle') = 'creating'`,
          sql`(json_extract(${sessionsTable.session}, '$.chats[0].status') & ${activeStatus}) != 0`,
        ),
      )
      .orderBy(asc(sessionsTable.uri))
      .all();
  }

  sessionCandidates(input: SessionCandidatesParams): { uri: string; bytes: number }[] {
    return this.db
      .select({
        uri: sessionsTable.uri,
        bytes: sql<number>`LENGTH(CAST(${sessionsTable.session} AS BLOB))`,
      })
      .from(sessionsTable)
      .where(input.cursor === void 0 ? void 0 : gt(sessionsTable.uri, input.cursor))
      .orderBy(asc(sessionsTable.uri))
      .limit(input.limit + 1)
      .all();
  }

  sessionBytes(channel: string): { uri: string; chatUri: string; bytes: number } | undefined {
    const match = or(eq(sessionsTable.uri, channel), eq(sessionsTable.chatUri, channel));

    return this.db
      .select({
        uri: sessionsTable.uri,
        chatUri: sessionsTable.chatUri,
        bytes: sql<number>`LENGTH(CAST(${sessionsTable.session} AS BLOB))`,
      })
      .from(sessionsTable)
      .where(match)
      .get();
  }

  insertSession(record: SessionRecord): void {
    this.db.insert(sessionsTable).values(record).run();
  }

  bindAgentSession(uri: string, acpSession: string): void {
    this.db.update(sessionsTable).set({ acpSession }).where(eq(sessionsTable.uri, uri)).run();
  }

  deleteSession(uri: string): void {
    this.db.delete(sessionsTable).where(eq(sessionsTable.uri, uri)).run();
  }

  writeSession(uri: string, session: SessionState): void {
    const bytes = new TextEncoder().encode(JSON.stringify(session)).byteLength;
    checkBytes(bytes, MAX_SESSION_BYTES, "Session metadata exceeds the storage budget");
    this.db
      .update(sessionsTable)
      .set({ session, modifiedAt: new Date().toISOString() })
      .where(eq(sessionsTable.uri, uri))
      .run();
  }

  sessionCount(): number {
    return this.db.select({ value: count() }).from(sessionsTable).get()?.value ?? 0;
  }
}

export { SessionStore };
