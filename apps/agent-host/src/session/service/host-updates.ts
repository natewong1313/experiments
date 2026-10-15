import { errorMessage } from "../../shared/errors";
import { isErrorRetryable } from "durable-utils/do-utils";
import { jitterBackoff } from "durable-utils/retries";
import type { HostSessionUpdateRequest } from "../../shared/rpc/host";
import type { SessionDatabase } from "../db/database";
import type { PendingHostUpdate, SessionRecord } from "../db/schema";

type HostUpdatesOptions = {
  db: SessionDatabase;
  deliver(hostId: string, update: HostSessionUpdateRequest): Promise<void>;
};

export type SessionChange = (record: SessionRecord) => HostSessionUpdateRequest | undefined;

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_BATCH_SIZE = 32;
const PASS_BUDGET_MS = 10_000;
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 60_000;
const deliveryTimeoutError = new Error("Host update timed out");

/** Stores host updates with session changes and delivers them in order. */
export class HostUpdatesService {
  private options: HostUpdatesOptions;
  private sending?: Promise<void>;

  constructor(options: HostUpdatesOptions) {
    this.options = options;
  }

  /** Saves the change, its host update, and the recovery alarm in one storage transaction. */
  async save(change: SessionChange): Promise<boolean> {
    const { db } = this.options;

    return await db.transaction(async () => {
      const record = await db.session.get();
      const update = record ? change(record) : undefined;

      if (record && update) {
        await db.session.update(record);
        db.hostUpdates.add({
          hostId: record.hostId,
          update: { ...update, defaultChat: record.sessionState.defaultChat },
          retryAt: Date.now() + BASE_RETRY_MS,
        });
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

  async retry(): Promise<void> {
    try {
      await this.flush();
    } finally {
      await this.options.db.transaction(() => this.schedule());
    }
  }

  /** Restarts delivery of stored updates, including updates stopped by a permanent failure. */
  async resume(): Promise<void> {
    const { db } = this.options;

    await db.transaction(async () => {
      const first = db.hostUpdates.first();

      if (first?.retryAt === null) {
        db.hostUpdates.attempt(first.id, first.attempts, Date.now());
      }

      await this.schedule();
    });
    await this.retry();
  }

  /** Clears pending updates and their alarm within the caller's session removal transaction. */
  async clear(): Promise<void> {
    this.options.db.hostUpdates.clear();
    await this.schedule();
  }

  /** Schedules an alarm for the oldest update. A null retry time stops automatic delivery after a permanent failure. */
  async schedule(): Promise<void> {
    const { db } = this.options;
    const first = db.hostUpdates.first();

    if (first?.retryAt === null || first === undefined) {
      await db.deleteAlarm();
    } else {
      const time = Math.max(Date.now(), first.retryAt);
      await db.setAlarm(time);
    }
  }

  private async drain(): Promise<void> {
    const { db } = this.options;
    const deadline = Date.now() + PASS_BUDGET_MS;

    for (let count = 0; count < MAX_BATCH_SIZE && Date.now() < deadline; count += 1) {
      const pending = db.hostUpdates.first();

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
    const { db } = this.options;
    const attempts = pending.attempts + 1;

    const jitter = jitterBackoff(attempts, BASE_RETRY_MS, MAX_RETRY_MS);
    const retryAt = Date.now() + DELIVERY_TIMEOUT_MS + Math.max(BASE_RETRY_MS, jitter);

    await db.transaction(async () => {
      db.hostUpdates.attempt(pending.id, attempts, retryAt);
      await this.schedule();
    });

    try {
      await deliverWithinDeadline(() => this.options.deliver(pending.hostId, pending.update));
    } catch (error) {
      const retryable = error === deliveryTimeoutError || isErrorRetryable(error);

      await db.transaction(async () => {
        db.hostUpdates.fail(pending.id, errorMessage(error), retryable ? retryAt : null);
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

    await db.transaction(async () => {
      db.hostUpdates.remove(pending.id);
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
