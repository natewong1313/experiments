import { DurabilityAlarms } from "durability";
import type { DurableAlarmHandler } from "durability";
import { sessionNotFound } from "../shared/protocol";
import type { SessionDatabase } from "./db/database";
import type { SessionRecord } from "./db/schema";
import { retryDelay } from "./lifecycle-policy";
import type { SessionLifecyclePolicy } from "./lifecycle-policy";
import { phaseOf, SessionRecords } from "./records";

type AlarmName =
  | "syncCatalog"
  | "flushSubscribers"
  | "checkSubscribers"
  | "finishCreate"
  | "finishDispose";

export type SessionAlarms = DurabilityAlarms<AlarmName>;

type OpenStorage = { kind: "open"; alarms: SessionAlarms; policy: SessionLifecyclePolicy };

/**
 * The session has storage only between creation and deletion. Without storage, reads return
 * nothing and writes do nothing. This prevents a request for an absent session from creating
 * storage. The `durability` helpers run their own migrations, so they exist only while the
 * storage is open.
 */
type StorageState = { kind: "absent" } | OpenStorage | { kind: "removing"; removed: Promise<void> };

type SessionStorageOptions = {
  ctx: DurableObjectState;
  db: SessionDatabase;
  handlers: Record<AlarmName, DurableAlarmHandler>;
  /** Returns the alarm timing. The storage reads it once each time it opens. */
  policy(): SessionLifecyclePolicy;
};

const CATALOG_SYNC_TIMEOUT_MS = 30_000;

/** Owns the storage state of one session object, its record, and its named alarms. */
export class SessionStorage {
  readonly records: SessionRecords;
  private options: SessionStorageOptions;
  private state: StorageState = { kind: "absent" };

  constructor(options: SessionStorageOptions) {
    this.options = options;
    this.records = new SessionRecords(options.db);
  }

  /** Returns true if the session tables exist. Reads without writing. */
  hasTables(): boolean {
    return this.options.db.hasMigrated();
  }

  isOpen(): boolean {
    return this.state.kind === "open";
  }

  /** Resolves after a deletion that runs now. */
  async settled(): Promise<void> {
    if (this.state.kind === "removing") {
      await this.state.removed;
    }
  }

  /** Creates or migrates the session tables and the named alarms. */
  async open(): Promise<void> {
    // A create for this session ID can arrive while `remove` deletes the old storage.
    await this.settled();

    if (this.state.kind === "open") {
      return;
    }

    await this.options.db.migrate();
    const policy = this.options.policy();

    const alarms = new DurabilityAlarms({
      context: this.options.ctx,
      handlers: this.options.handlers,
      methods: {
        // The host ignores repeated summaries, so a timed-out sync can run again.
        syncCatalog: { attemptTimeoutMs: CATALOG_SYNC_TIMEOUT_MS, retryTimeouts: true },
        // Each creation step can run again, so a timed-out attempt can run again.
        finishCreate: {
          attemptTimeoutMs: policy.createAttemptTimeoutMs,
          retryTimeouts: true,
          retries: {
            maxAttempts: policy.createAttempts,
            delay: (attempt): number => retryDelay(policy, attempt),
          },
        },
      },
    });

    this.state = { kind: "open", alarms, policy };
  }

  /**
   * Deletes all storage. Writes stop when this method starts. If the deletion fails, the
   * storage stays open, so the caller can schedule a new attempt.
   */
  async remove(): Promise<void> {
    if (this.state.kind !== "open") {
      // Another call may be removing the storage now.
      await this.settled();

      return;
    }

    const open = this.state;
    const removed = this.options.db.deleteAll();
    this.state = { kind: "removing", removed };

    try {
      await removed;
      this.state = { kind: "absent" };
    } catch (error) {
      this.state = open;
      throw error;
    }
  }

  /** Returns the stored record, also while it is disposing. */
  record(): SessionRecord | undefined {
    return this.state.kind === "open" ? this.records.get() : undefined;
  }

  /** Returns the session record, or undefined if the session is absent or disposing. */
  session(): SessionRecord | undefined {
    const record = this.record();

    return phaseOf(record) === "disposing" ? undefined : record;
  }

  /**
   * Returns the session record.
   *
   * @throws {AHPError} If the session is absent or disposing.
   */
  requireSession(): SessionRecord {
    const session = this.session();

    if (!session) {
      throw sessionNotFound();
    }

    return session;
  }

  /** Returns the named alarms and the alarm timing while the storage is open. */
  opened(): OpenStorage | undefined {
    return this.state.kind === "open" ? this.state : undefined;
  }

  /** Returns the named alarms while the storage is open. */
  alarms(): SessionAlarms | undefined {
    return this.opened()?.alarms;
  }

  /**
   * Returns the named alarms and the alarm timing.
   *
   * @throws {Error} If the storage is not open.
   */
  requireOpen(): OpenStorage {
    const open = this.opened();

    if (!open) {
      throw new Error("Session storage is not open");
    }

    return open;
  }
}
