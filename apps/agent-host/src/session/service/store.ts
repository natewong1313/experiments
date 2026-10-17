import { eq } from "drizzle-orm";
import { DurabilityAlarms } from "durability";
import { callDoRpc } from "../../shared/do-rpc";
import { RouterFanout } from "../../shared/fanout";
import { sessionUri } from "../../shared/lookups";
import { AHPError, sessionNotFound } from "../../shared/protocol";
import type { SessionUpdate } from "../../shared/rpc/router";
import type {
  SessionSubscribeRequest,
  SessionSubscribeResponse,
  SessionUnsubscribeRequest,
} from "../../shared/rpc/session";
import type { StubFor } from "../../shared/stubs";
import type { SessionDatabase } from "../db/database";
import { sessionTable } from "../db/schema";
import type { SessionRecord } from "../db/schema";
import { sessionSummary } from "../state";

/** Changes the record in place and returns the update to push, or undefined to skip. */
export type SessionChange = (record: SessionRecord) => SessionUpdate | undefined;

type SessionAlarms = DurabilityAlarms<"syncCatalogue" | "flushSubscribers">;

type SessionStoreOptions = {
  ctx: DurableObjectState;
  db: SessionDatabase;
  /** Returns the session ID from the Durable Object name. */
  sessionId(): string;
  host(name: string): StubFor<"host">;
  router(name: string): StubFor<"router">;
};

const CATALOGUE_SYNC_TIMEOUT_MS = 30_000;

/**
 * Stores the session record and pushes each change to the subscribed routers. It also syncs
 * the session summary to the host.
 *
 * The session has storage only between creation and removal. Without storage, reads return
 * nothing and writes do nothing. This prevents a request for an absent session from creating
 * storage.
 */
export class SessionStore {
  private options: SessionStoreOptions;
  private db: SessionDatabase;
  private fanout: RouterFanout<SessionUpdate>;
  // Defined while the session has storage. `remove` clears it before it deletes the storage.
  private alarms?: SessionAlarms;
  private removing?: Promise<void>;

  constructor(options: SessionStoreOptions) {
    this.options = options;
    this.db = options.db;

    this.fanout = new RouterFanout<SessionUpdate>({
      database: options.db,
      router: (name): StubFor<"router"> => this.options.router(name),
      sender: {
        send: async (router, updates, channels): Promise<string[]> =>
          await this.sendUpdates(router, updates, channels),
        gap: async (router, revision): Promise<string[]> => {
          const sessionId = this.options.sessionId();
          const result = await router.sessionActions({ sessionId, after: revision, updates: [] });

          return result.subscribed;
        },
      },
      scheduleFlush: async (time): Promise<void> => {
        await this.alarms?.flushSubscribers(time);
      },
    });
  }

  /**
   * Opens existing storage after a restart and applies `recover`. Then schedules a check for
   * routers that missed updates, because a restart loses the pushes in flight. Writes nothing
   * if the session has no storage.
   */
  async load(recover: SessionChange): Promise<void> {
    if (!this.db.hasTables()) {
      return;
    }

    await this.open();
    await this.apply(recover);
    const record = this.record();

    if (record) {
      await this.fanout.recover(record.revision);
    }
  }

  /** Runs due named alarms. A session without storage has none. */
  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.alarms?.alarm(info);
  }

  /**
   * Creates the storage and inserts a new record.
   *
   * @throws {Error} If a session exists.
   */
  async insert(record: SessionRecord): Promise<void> {
    await this.open();

    this.db.transactionSync(() => {
      if (this.db.orm.select({ id: sessionTable.id }).from(sessionTable).get()) {
        throw new Error("Session already exists");
      }

      this.db.orm.insert(sessionTable).values(record).run();
    });
  }

  /** Returns the session record, or undefined if the session has no storage. */
  record(): SessionRecord | undefined {
    return this.alarms ? this.db.orm.select().from(sessionTable).get() : undefined;
  }

  /**
   * Returns the session record.
   *
   * @throws {AHPError} If the session does not exist.
   */
  requireRecord(): SessionRecord {
    const record = this.record();

    if (!record) {
      throw sessionNotFound();
    }

    return record;
  }

  /** Stores the ACP session ID of the record with the default chat `defaultChat`. */
  setAcpSessionId(defaultChat: string, acpSessionId: string): void {
    const record = this.record();

    if (record?.sessionState.defaultChat === defaultChat) {
      this.db.orm
        .update(sessionTable)
        .set({ acpSessionId })
        .where(eq(sessionTable.id, record.id))
        .run();
    }
  }

  /**
   * Saves the changed record, then queues its update for the subscribed routers. Schedules a
   * catalogue sync when a summary field other than `modifiedAt` changes.
   * Returns false when the session does not exist or the change is skipped.
   */
  async apply(change: SessionChange): Promise<boolean> {
    const { alarms } = this;

    if (!alarms) {
      return false;
    }

    const saved = this.db.transactionSync(() => {
      const record = this.db.orm.select().from(sessionTable).get();

      if (!record) {
        return;
      }

      const before = catalogueFields(record);
      const update = change(record);

      if (!update) {
        return;
      }

      this.db.orm.update(sessionTable).set(record).where(eq(sessionTable.id, record.id)).run();

      return { update, summaryChanged: before !== catalogueFields(record) };
    });

    if (!saved) {
      return false;
    }

    await this.fanout.publish([saved.update]);

    if (saved.summaryChanged) {
      await alarms.syncCatalogue(Date.now());
    }

    return true;
  }

  /** Schedules a catalogue sync, for example after creation. */
  async syncCatalogue(): Promise<void> {
    await this.alarms?.syncCatalogue(Date.now());
  }

  /**
   * Subscribes a router to a channel of this session and returns the channel snapshot.
   *
   * @throws {AHPError} If the session does not exist or the channel does not belong to it.
   */
  subscribe(req: SessionSubscribeRequest): SessionSubscribeResponse {
    return this.db.transactionSync(() => {
      const record = this.requireRecord();
      const sessionChannel = sessionUri(record.id);

      if (req.channel !== sessionChannel && req.channel !== record.sessionState.defaultChat) {
        throw new AHPError("Channel does not belong to this session");
      }

      this.fanout.subscribe(req.router, req.channel, record.revision);

      return {
        revision: record.revision,
        state: req.channel === sessionChannel ? record.sessionState : record.chatState,
      };
    });
  }

  /** Removes subscriptions of a router. Does nothing for an absent session. */
  unsubscribe(req: SessionUnsubscribeRequest): void {
    if (this.alarms) {
      this.fanout.unsubscribe(req.router, req.channels);
    }
  }

  /**
   * Waits for the queued updates, tells the subscribed routers that the session is disposed,
   * then deletes all storage. `apply` writes nothing after this method starts.
   */
  async remove(): Promise<void> {
    if (!this.alarms) {
      // Another call may be removing the storage now.
      await this.removing;

      return;
    }

    this.alarms = undefined;

    this.removing = (async (): Promise<void> => {
      await this.fanout.idle();
      await this.notifyDisposed();
      this.fanout.reset();
      await this.db.deleteAll();
    })();

    try {
      await this.removing;
    } finally {
      this.removing = undefined;
    }
  }

  /**
   * Creates or migrates the session tables and the named alarms. The `durability` helpers run
   * their own migrations. Thus the store creates them only while the session has storage.
   */
  private async open(): Promise<void> {
    // The host can create a session ID again while `remove` deletes the old storage.
    await this.removing;

    if (this.alarms) {
      return;
    }

    await this.db.migrate();

    const alarms = new DurabilityAlarms({
      context: this.options.ctx,
      handlers: {
        syncCatalogue: async (): Promise<void> => {
          await this.sendSummary();
        },
        flushSubscribers: async (): Promise<void> => {
          const record = this.record();

          if (record) {
            await this.fanout.flush(record.revision);
          }
        },
      },
      methods: {
        // The host ignores repeated summaries, so a timed-out sync can run again.
        syncCatalogue: { attemptTimeoutMs: CATALOGUE_SYNC_TIMEOUT_MS, retryTimeouts: true },
      },
    });

    this.alarms = alarms;
  }

  /** Sends updates to a router with only the actions of its channels. */
  private async sendUpdates(
    router: StubFor<"router">,
    updates: SessionUpdate[],
    channels: ReadonlySet<string>,
  ): Promise<string[]> {
    const [first] = updates;

    if (first === undefined) {
      return [...channels];
    }

    const filtered = updates.map(({ revision, actions }) => ({
      revision,
      actions: actions.filter((envelope) => channels.has(envelope.channel)),
    }));

    const result = await router.sessionActions({
      sessionId: this.options.sessionId(),
      after: first.revision - 1,
      updates: filtered,
    });

    return result.subscribed;
  }

  /** Tells each subscribed router that the session is disposed. Ignores failed calls. */
  private async notifyDisposed(): Promise<void> {
    const sessionId = this.options.sessionId();

    await Promise.allSettled(
      this.fanout.routers().map(async (router) => {
        await callDoRpc(
          () => this.options.router(router),
          (stub) => stub.sessionDisposed({ sessionId }),
        );
      }),
    );
  }

  /** Sends the latest summary to the host. The host ignores old revisions. */
  private async sendSummary(): Promise<void> {
    const record = this.record();

    if (!record) {
      return;
    }

    await this.options.host(record.hostId).summaryChanged({
      sessionId: record.id,
      defaultChat: record.chatState.resource,
      revision: record.revision,
      summary: sessionSummary(record),
    });
  }
}

/**
 * Returns the summary fields that the host stores, without `modifiedAt`, as JSON. A change to
 * `modifiedAt` alone does not schedule a catalogue sync.
 */
function catalogueFields(record: SessionRecord): string {
  const { modifiedAt: _modifiedAt, ...fields } = sessionSummary(record);

  return JSON.stringify(fields);
}
