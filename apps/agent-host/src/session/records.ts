import { eq } from "drizzle-orm";
import { SessionLifecycle as AHPSessionLifecycle } from "@microsoft/agent-host-protocol";
import type { SessionUpdate } from "../shared/rpc/router";
import type { SessionDatabase } from "./db/database";
import { sessionTable } from "./db/schema";
import type { SessionRecord } from "./db/schema";
import { sessionSummary } from "./state";

/** Changes the record in place and returns the update to push, or undefined to skip. */
export type SessionChange = (record: SessionRecord) => SessionUpdate | undefined;

/** A saved change, and whether it changed a summary field that the host stores. */
export type SavedChange = { update: SessionUpdate; summaryChanged: boolean };

/**
 * The phase of a session object. A creating or ready session becomes disposing when a dispose
 * commits, and absent when the session deletes its storage.
 */
export type SessionPhase = "absent" | "creating" | "ready" | "disposing";

export function phaseOf(record: SessionRecord | undefined): SessionPhase {
  if (!record) {
    return "absent";
  }

  if (record.disposing) {
    return "disposing";
  }

  return record.sessionState.lifecycle === AHPSessionLifecycle.Ready ? "ready" : "creating";
}

/**
 * Returns the default chat of the record. Each creation makes a new chat ID, so the default
 * chat identifies one creation of a session ID.
 */
export function defaultChatOf(record: SessionRecord): string {
  return record.chatState.resource;
}

/**
 * Reads and writes the one session record. The caller checks that the session tables exist.
 * Methods that take a `defaultChat` ignore a record of another creation.
 */
export class SessionRecords {
  private db: SessionDatabase;

  constructor(db: SessionDatabase) {
    this.db = db;
  }

  /** Returns the stored record, also while it is disposing. */
  get(): SessionRecord | undefined {
    return this.db.orm.select().from(sessionTable).get();
  }

  /** Inserts the record from `build` if no record is stored. Returns the stored record. */
  insertIfAbsent(build: () => SessionRecord): SessionRecord {
    return this.db.transactionSync(() => {
      const existing = this.get();

      if (existing) {
        return existing;
      }

      const created = build();
      this.db.orm.insert(sessionTable).values(created).run();

      return created;
    });
  }

  /**
   * Applies `change` to a record that is not disposing and saves it. Returns undefined if no
   * such record is stored or the change is skipped.
   *
   * A change that leaves the summary fields as they were keeps the host in sync. Thus
   * `syncedRevision` moves with `revision` when it was current.
   */
  save(change: SessionChange): SavedChange | undefined {
    return this.db.transactionSync(() => {
      const record = this.get();

      if (!record || record.disposing) {
        return;
      }

      const before = catalogFields(record);
      const wasSynced = record.syncedRevision === record.revision;
      const update = change(record);

      if (!update) {
        return;
      }

      const summaryChanged = before !== catalogFields(record);

      if (wasSynced && !summaryChanged) {
        record.syncedRevision = record.revision;
      }

      this.write(record);

      return { update, summaryChanged };
    });
  }

  /**
   * Commits a dispose of the creation with `defaultChat`: applies `change` if it is given and
   * marks the record as disposing. This method is the only writer of `disposing`. Returns
   * undefined if no such record is stored or it is disposing.
   */
  commitDispose(
    defaultChat: string,
    change?: (record: SessionRecord) => SessionUpdate,
  ): { update?: SessionUpdate } | undefined {
    return this.db.transactionSync(() => {
      const record = this.get();

      if (!record || record.disposing || defaultChatOf(record) !== defaultChat) {
        return;
      }

      const update = change?.(record);
      record.disposing = true;
      this.write(record);

      return { update };
    });
  }

  /**
   * Adds one to the `finishCreate` attempts of the creation with `defaultChat`, and returns
   * the new count. Returns 0 for a record of another creation.
   */
  countCreationAttempt(defaultChat: string): number {
    return this.db.transactionSync(() => {
      const record = this.get();

      if (!record || defaultChatOf(record) !== defaultChat) {
        return 0;
      }

      const creationAttempts = record.creationAttempts + 1;
      this.update(record.id, { creationAttempts });

      return creationAttempts;
    });
  }

  setAcpSessionId(defaultChat: string, acpSessionId: string): void {
    this.db.transactionSync(() => {
      const record = this.get();

      if (record && defaultChatOf(record) === defaultChat) {
        this.update(record.id, { acpSessionId });
      }
    });
  }

  /** Records that the host has the summary of `revision`. */
  markSynced(defaultChat: string, revision: number): void {
    this.db.transactionSync(() => {
      const record = this.get();

      if (record && defaultChatOf(record) === defaultChat && record.syncedRevision < revision) {
        this.update(record.id, { syncedRevision: revision });
      }
    });
  }

  private write(record: SessionRecord): void {
    this.update(record.id, record);
  }

  private update(id: string, values: Partial<SessionRecord>): void {
    this.db.orm.update(sessionTable).set(values).where(eq(sessionTable.id, id)).run();
  }
}

/**
 * Returns the summary fields that the host stores, without `modifiedAt`, as JSON. A change to
 * `modifiedAt` alone does not schedule a catalog sync.
 */
function catalogFields(record: SessionRecord): string {
  const { modifiedAt: _modifiedAt, ...fields } = sessionSummary(record);

  return JSON.stringify(fields);
}
