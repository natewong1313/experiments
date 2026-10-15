import { asc, eq } from "drizzle-orm";
import { errorMessage } from "../../shared/errors";
import { isErrorRetryable } from "durable-utils/do-utils";
import { jitterBackoff } from "durable-utils/retries";
import type { HostSessionUpdateRequest } from "../../shared/rpc/host";
import type { SessionDatabase } from "../db/database";
import { hostUpdatesTable, sessionTable } from "../db/schema";
import type { PendingHostUpdate, SessionRecord } from "../db/schema";

export type SessionChange = (record: SessionRecord) => HostSessionUpdateRequest | undefined;

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_BATCH_SIZE = 32;
const PASS_BUDGET_MS = 10_000;
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 60_000;
const deliveryTimeoutError = new Error("Host update timed out");

/** Stores host updates with session changes and delivers them in order. */
export class HostUpdatesService {
  private sending?: Promise<void>;
  private db: SessionDatabase;
  private deliver: (hostId: string, update: HostSessionUpdateRequest) => Promise<void>;

  constructor(
    db: SessionDatabase,
    deliver: (hostId: string, update: HostSessionUpdateRequest) => Promise<void>,
  ) {
    this.db = db;
    this.deliver = deliver;
  }

  /** Saves the change, its host update, and the recovery alarm in one storage transaction. */
  async save(change: SessionChange): Promise<boolean> {
    return await this.db.transaction(async () => {
      const record = this.db.orm.select().from(sessionTable).get();
      const update = record ? change(record) : undefined;

      if (record && update) {
        this.db.orm.update(sessionTable).set(record).where(eq(sessionTable.id, record.id)).run();
        this.db.orm
          .insert(hostUpdatesTable)
          .values({
            hostId: record.hostId,
            update: { ...update, defaultChat: record.sessionState.defaultChat },
            retryAt: Date.now() + BASE_RETRY_MS,
          })
          .run();
      }

      await this.schedule();

      return update !== undefined;
    });
  }

  /** Concurrent calls share the current delivery attempt. Updates remain stored until the host confirms receipt. */
  async flush(): Promise<void> {
    const sending = this.sending ?? this.drain();
    this.sending = sending;

    try {
      await sending;
    } finally {
      if (this.sending === sending) {
        this.sending = undefined;
      }
    }
  }

  /** Delivers due updates, then reschedules the alarm for the next one. Safe to call when nothing is due. */
  async onAlarm(): Promise<void> {
    try {
      await this.flush();
    } finally {
      await this.db.transaction(() => this.schedule());
    }
  }

  /** Restarts delivery of stored updates, including updates stopped by a permanent failure. */
  async resumeAfterFailure(): Promise<void> {
    await this.db.transaction(async () => {
      const first = this.db.orm
        .select({
          id: hostUpdatesTable.id,
          retryAt: hostUpdatesTable.retryAt,
          attempts: hostUpdatesTable.attempts,
        })
        .from(hostUpdatesTable)
        .orderBy(asc(hostUpdatesTable.id))
        .get();

      if (first?.retryAt === null) {
        this.db.orm
          .update(hostUpdatesTable)
          .set({ attempts: first.attempts, retryAt: Date.now() })
          .where(eq(hostUpdatesTable.id, first.id))
          .run();
      }

      await this.schedule();
    });
    await this.onAlarm();
  }

  /** Clears pending updates and their alarm within the caller's session removal transaction. */
  async clear(): Promise<void> {
    // oxlint-disable-next-line drizzle/enforce-delete-with-where -- removes all updates owned by the disposed session
    this.db.orm.delete(hostUpdatesTable).run();
    await this.schedule();
  }

  /** Schedules an alarm for the oldest update. A null retry time stops automatic delivery after a permanent failure. */
  async schedule(): Promise<void> {
    const first = this.db.orm
      .select({ retryAt: hostUpdatesTable.retryAt })
      .from(hostUpdatesTable)
      .orderBy(asc(hostUpdatesTable.id))
      .get();

    if (first?.retryAt === null || first === undefined) {
      await this.db.deleteAlarm();
    } else {
      const time = Math.max(Date.now(), first.retryAt);
      await this.db.setAlarm(time);
    }
  }

  private async drain(): Promise<void> {
    const deadline = Date.now() + PASS_BUDGET_MS;

    for (let count = 0; count < MAX_BATCH_SIZE && Date.now() < deadline; count += 1) {
      const pending = this.db.orm
        .select()
        .from(hostUpdatesTable)
        .orderBy(asc(hostUpdatesTable.id))
        .get();

      if (!pending) {
        return;
      }

      if (pending.retryAt === null) {
        return;
      }

      if (pending.attempts > 0 && pending.retryAt > Date.now()) {
        return;
      }

      // Each update must finish before delivery of the next revision starts.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const delivered = await this.send(pending);

      if (!delivered) {
        return;
      }
    }
  }

  private async send(pending: PendingHostUpdate): Promise<boolean> {
    const attempts = pending.attempts + 1;

    const jitter = jitterBackoff(attempts, BASE_RETRY_MS, MAX_RETRY_MS);
    const retryAt = Date.now() + DELIVERY_TIMEOUT_MS + Math.max(BASE_RETRY_MS, jitter);

    await this.db.transaction(async () => {
      this.db.orm
        .update(hostUpdatesTable)
        .set({ attempts, retryAt })
        .where(eq(hostUpdatesTable.id, pending.id))
        .run();
      await this.schedule();
    });

    try {
      await deliverWithinDeadline(() => this.deliver(pending.hostId, pending.update));
    } catch (error) {
      const retryable = error === deliveryTimeoutError || isErrorRetryable(error);

      await this.db.transaction(async () => {
        this.db.orm
          .update(hostUpdatesTable)
          .set({ error: errorMessage(error), retryAt: retryable ? retryAt : null })
          .where(eq(hostUpdatesTable.id, pending.id))
          .run();
        await this.schedule();
      });

      if (!retryable) {
        console.error("Host update delivery stopped", {
          hostId: pending.hostId,
          sessionId: pending.update.sessionId,
          revision: pending.update.revision,
          error: errorMessage(error),
        });
      }

      return false;
    }

    await this.db.transaction(async () => {
      this.db.orm.delete(hostUpdatesTable).where(eq(hostUpdatesTable.id, pending.id)).run();
      await this.schedule();
    });

    return true;
  }
}

/** Stops waiting after the deadline. The host can still accept the update after this timeout. */
async function deliverWithinDeadline(deliver: () => Promise<void>): Promise<void> {
  const controller = new AbortController();

  async function timeout(): Promise<never> {
    await scheduler.wait(DELIVERY_TIMEOUT_MS, { signal: controller.signal });
    throw deliveryTimeoutError;
  }

  try {
    await Promise.race([deliver(), timeout()]);
  } finally {
    controller.abort();
  }
}
