import { Durability, DurabilityAlarms, DurabilityScheduler } from "durability";
import type { DurableCall } from "durability";
import type { SenderChannels } from "../sender";

/**
 * The ID of the durable call that unsubscribes the router at its senders after a close.
 */
const CLOSE_ID = "close";

/**
 * Durable calls for subscriptions accepted after the connection closes use this ID prefix.
 * Each call needs a unique ID because a frame can register it after the initial close finishes.
 */
const LATE_CLOSE_ID_PREFIX = "late-close:";

/**
 * Work that is due sooner than this delay runs from an in-memory timer.
 * Later work runs from the main class alarm of the router DO.
 */
const ALARM_MIN_DELAY_MS = 1000;

/**
 * The delay of the wake-up alarm. The wake-up lets the router delete its storage after a
 * close. It usually runs from the router alarm handler. It runs from an in-memory timer if the
 * scheduler reconciles the alarm less than ALARM_MIN_DELAY_MS before it is due.
 */
const WAKE_UP_DELAY_MS = 2000;

/** The parts of the durable work that the router class supplies. */
export type RouterDurabilityHooks = {
  /** Returns the timing of the durable calls. The class reads it each time it opens. */
  policy(): RouterDurabilityPolicy;
  /**
   * Runs in the handler of the wake-up alarm. It must not delete storage before the handler
   * returns.
   */
  onWakeUp(): void;
};

/** The timing of the durable calls of the router. */
export type RouterDurabilityPolicy = {
  /**
   * The maximum duration of one unsubscribe attempt. At the timeout, the attempt stops waiting
   * for the senders and the call retries.
   */
  unsubscribeAttemptTimeoutMs: number;
  /**
   * The total number of unsubscribe attempts. After attempts end, cleanup can delete router
   * storage even if the last attempt failed. A sender can remove remaining subscriptions at its next check.
   */
  unsubscribeAttempts: number;
};

export const DEFAULT_ROUTER_DURABILITY_POLICY: RouterDurabilityPolicy = {
  unsubscribeAttemptTimeoutMs: 30_000,
  // With the default backoff of `durability`, the retries last 10 to 20 minutes.
  unsubscribeAttempts: 12,
};

/**
 * The handlers that get passed to the Durability instance. Each handler must settle when its
 * `signal` aborts. The library starts no retry while an attempt is still running.
 *
 * `unsubscribeSenders` tells each sender that the router closed. Senders remove all subscriptions
 * of the router and ignore the payload's channels. The payload retains channels for compatibility
 * with durable calls stored by earlier versions.
 */
export type CallHandlers = {
  unsubscribeSenders(call: DurableCall<SenderChannels>): Promise<void>;
};

type DurableCtx = {
  scheduler: DurabilityScheduler;
  calls: Durability<CallHandlers>;
  alarms: DurabilityAlarms<"wakeUp">;
};

/**
 * Owns all durable work we need for the router DO.
 * Right now, we handle make unsubscribing from host/session DOs durable, plus the cleanup.
 *
 * We use a DurabilityScheduler to combine durable handlers + alarms.
 *
 * Since everything in here depends on having ctx.storage properly initialized and alive, we don't
 * delete tables on cleanup inside this class. Instead, the main class DO does it.
 */
export class RouterDurability {
  private ctx: DurableObjectState;
  private handlers: CallHandlers;
  private hooks: RouterDurabilityHooks;
  private durableCtx?: DurableCtx;

  constructor(ctx: DurableObjectState, handlers: CallHandlers, hooks: RouterDurabilityHooks) {
    this.ctx = ctx;
    this.handlers = handlers;
    this.hooks = hooks;
  }

  /**
   * We setup all the durablity items that go into context if it hasn't been setup yet.
   */
  open(): void {
    if (this.durableCtx) {
      return;
    }

    const policy = this.hooks.policy();

    const scheduler = new DurabilityScheduler({
      context: this.ctx,
      alarmMinDelayMs: ALARM_MIN_DELAY_MS,
    });

    const calls = new Durability({
      scheduler,
      handlers: this.handlers,
      methods: {
        unsubscribeSenders: {
          attemptTimeoutMs: policy.unsubscribeAttemptTimeoutMs,
          retries: { maxAttempts: policy.unsubscribeAttempts },
        },
      },
    });

    const alarms = new DurabilityAlarms({
      scheduler,
      // The wake-up makes the router check its cleanup again.
      // This class does not delete storage.
      handlers: {
        wakeUp: (): void => {
          this.hooks.onWakeUp();
        },
      },
    });

    this.durableCtx = { scheduler, calls, alarms };
  }

  /**
   * Should be called by the DO after it deletes it's storage. Since deleting storage
   * deletes all the tables the durablity library needs, we need to make sure to set it to
   * undefined so we don't call it.
   */
  reset(): void {
    this.durableCtx = undefined;
  }

  /**
   * Registers a durable call that unsubscribes at the senders, then schedules the wake-up alarm.
   */
  async registerClose(senders: SenderChannels): Promise<void> {
    await this.registerUnsubscribe(CLOSE_ID, senders);
  }

  /**
   * Registers a durable close for senders that accepted a subscription after the connection closed,
   * then schedules the wake-up alarm. The initial close can reach a sender before its subscribe request.
   * Call this only after `registerClose`.
   */
  async registerLateClose(senders: SenderChannels): Promise<void> {
    await this.registerUnsubscribe(`${LATE_CLOSE_ID_PREFIX}${crypto.randomUUID()}`, senders);
  }

  /**
   * True if a close started. The record of its unsubscribe call stays until the router deletes
   * its storage.
   */
  async closeStarted(): Promise<boolean> {
    if (!this.durableCtx) {
      return false;
    }

    const result = await this.durableCtx.calls.unsubscribeSenders.getResult(CLOSE_ID);

    return result.status !== "not_found";
  }

  /**
   * True while a durable call or alarm is pending. The scheduler keeps the router alarm set
   * while it has pending work, and deletes it when the work finishes.
   */
  async hasPendingWork(): Promise<boolean> {
    return (await this.ctx.storage.getAlarm()) !== null;
  }

  /**
   * Schedules the wake-up alarm. The runtime calls the router alarm handler when the alarm
   * fires. A new schedule replaces the pending one.
   */
  async scheduleWakeUp(): Promise<void> {
    await this.require().alarms.wakeUp(Date.now() + WAKE_UP_DELAY_MS);
  }

  /**
   * Tells the scheduler to run any due work and then remounts the alarms.
   * Does nothing if the router has no storage.
   */
  async mountAlarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.durableCtx?.scheduler.alarm(info);
  }

  /** Registers the unsubscribe call with `id`, then schedules the wake-up alarm. */
  private async registerUnsubscribe(id: string, senders: SenderChannels): Promise<void> {
    await this.require().calls.unsubscribeSenders({ id, payload: senders });
    await this.scheduleWakeUp();
  }

  /**
   * Returns the durable stuff.
   *
   * @throws {Error} If the router has no storage.
   */
  private require(): DurableCtx {
    if (!this.durableCtx) {
      throw new Error("Router durability is not open");
    }

    return this.durableCtx;
  }
}
