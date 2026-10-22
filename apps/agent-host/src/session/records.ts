import { eq } from "drizzle-orm";
import { SessionLifecycle as AHPSessionLifecycle } from "@microsoft/agent-host-protocol";
import type {
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
} from "@microsoft/agent-host-protocol";
import type { HostSessionEntry } from "../shared/rpc/host";
import type { SessionUpdate } from "../shared/rpc/router";
import { sessionUri } from "../shared/lookups";
import { ChatStore } from "./chat/store";
import type { HasSubscribers } from "./chat/store";
import type { SessionDatabase } from "./db/database";
import { sessionTable } from "./db/schema";
import type { SessionRecord } from "./db/schema";
import { sessionState, sessionSummary } from "./state";
import type { NewSessionRows } from "./state";

/**
 * Changes the session record in place and writes chat rows through `chats`. Returns the update
 * to publish, or undefined to skip a change that writes no rows. Chat writes commit with the
 * transaction. A change that writes chat rows must return an update.
 */
export type SessionChange = (record: SessionRecord, chats: ChatStore) => SessionUpdate | undefined;

/**
 * The outcome of applying a change to the session record. `absent` means the record is absent
 * or disposing. `skipped` means the change returned nothing. This lets an idempotent operation
 * succeed on retry without another side effect.
 */
export type ApplyOutcome = "absent" | "skipped" | "applied";

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
  return record.sessionState.defaultChat;
}

/**
 * Reads and writes the session record and its chats. The caller checks that the session
 * tables exist. Methods with `defaultChat` ignore records from a different creation of the same session.
 */
export class SessionRecords {
  readonly chats: ChatStore;
  private db: SessionDatabase;

  constructor(db: SessionDatabase, hasSubscribers: HasSubscribers) {
    this.db = db;
    this.chats = new ChatStore(db.orm, hasSubscribers);
  }

  /** Returns the stored record, also while it is disposing. */
  get(): SessionRecord | undefined {
    return this.db.orm.select().from(sessionTable).get();
  }

  /** Inserts the rows from `build` if no record is stored. Returns the stored record. */
  insertIfAbsent(build: () => NewSessionRows): SessionRecord {
    return this.db.transactionSync(() => {
      const existing = this.get();

      if (existing) {
        return existing;
      }

      const created = build();
      this.chats.insert(created.chat);
      this.db.orm.insert(sessionTable).values(created.session).run();

      return created.session;
    });
  }

  /** Returns the session state for the session channel, or the chat state for a chat channel. */
  channelState(record: SessionRecord, channel: string): AHPSessionState | AHPChatState {
    return channel === sessionUri(record.id)
      ? sessionState(record, this.chats)
      : this.chats.snapshot(channel);
  }

  /** Returns the catalog entry of the session at its current revision. */
  catalogEntry(record: SessionRecord): HostSessionEntry {
    const defaultChat = defaultChatOf(record);

    return {
      sessionId: record.id,
      defaultChat,
      revision: record.revision,
      summary: sessionSummary(record, this.chats.summary(defaultChat)),
    };
  }

  /**
   * Applies `change` to a record that is not disposing and saves it. Returns `absent` if no
   * such record is stored. If the change returns nothing, returns `skipped` without writing the record.
   * This lets an idempotent operation succeed on retry without another side effect.
   *
   * A change that leaves the summary fields as they were keeps the host in sync. Thus
   * `syncedRevision` moves with `revision` when it was current.
   */
  save(
    change: SessionChange,
  ):
    | { status: "absent" }
    | { status: "skipped" }
    | { status: "applied"; update: SessionUpdate; summaryChanged: boolean } {
    return this.db.transactionSync(() => {
      const record = this.get();

      if (!record || record.disposing) {
        return { status: "absent" };
      }

      const before = this.catalogFields(record);
      const wasSynced = record.syncedRevision === record.revision;
      const update = change(record, this.chats);

      if (!update) {
        return { status: "skipped" };
      }

      const summaryChanged = before !== this.catalogFields(record);

      if (wasSynced && !summaryChanged) {
        record.syncedRevision = record.revision;
      }

      this.write(record);

      return { status: "applied", update, summaryChanged };
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

  /**
   * Returns the summary fields that the host stores, without `modifiedAt`, as JSON. A change to
   * `modifiedAt` alone does not schedule a catalog sync.
   */
  private catalogFields(record: SessionRecord): string {
    const chat = this.chats.summary(defaultChatOf(record));
    const { modifiedAt: _modifiedAt, ...fields } = sessionSummary(record, chat);

    return JSON.stringify(fields);
  }

  private write(record: SessionRecord): void {
    this.update(record.id, record);
  }

  private update(id: string, values: Partial<SessionRecord>): void {
    this.db.orm.update(sessionTable).set(values).where(eq(sessionTable.id, id)).run();
  }
}
