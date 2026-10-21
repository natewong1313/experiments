import { Durability, DurabilityAlarms, DurabilityScheduler } from "durability";
import type { DurableCall } from "durability";
import type { SenderChannels } from "../sender";

/**
 * The ID of the durable call that unsubscribes the router at its senders after a close.
 */
const CLOSE_ID = "close";

/**
 * Work that is due sooner than this delay runs from an in-memory timer.
 * Later work runs from the main class alarm of the router DO.
 */
const ALARM_MIN_DELAY_MS = 1000;

/**
 * The delay of the wake-up alarm. The alarm calls the router alarm handler, which deletes
 * router storage after a close. Alarms with a delay longer than ALARM_MIN_DELAY_MS run from
 * the router alarm handler.
 */
const WAKE_UP_DELAY_MS = 2000;

/** The timing of the durable calls of the router. */
export type RouterDurabilityPolicy = {
  /**
   * The maximum duration of one unsubscribe attempt. At the timeout, the attempt stops waiting
   * for the senders and the call retries.
   */
  unsubscribeAttemptTimeoutMs: number;
};

export const DEFAULT_ROUTER_DURABILITY_POLICY: RouterDurabilityPolicy = {
  unsubscribeAttemptTimeoutMs: 30_000,
};

/**
 * The handlers that get passed to the Durability instance. Each handler must settle when its
 * `signal` aborts. The library starts no retry while an attempt is still running.
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
  private policy: () => RouterDurabilityPolicy;
  private durableCtx?: DurableCtx;

  /** `policy` returns the timing of the calls. The class reads it each time it opens. */
  constructor(
    ctx: DurableObjectState,
    handlers: CallHandlers,
    policy: () => RouterDurabilityPolicy,
  ) {
    this.ctx = ctx;
    this.handlers = handlers;
    this.policy = policy;
  }

  /**
   * We setup all the durablity items that go into context if it hasn't been setup yet.
   */
  open(): void {
    if (this.durableCtx) {
      return;
    }

    const scheduler = new DurabilityScheduler({
      context: this.ctx,
      alarmMinDelayMs: ALARM_MIN_DELAY_MS,
    });

    const calls = new Durability({
      scheduler,
      handlers: this.handlers,
      methods: {
        unsubscribeSenders: { attemptTimeoutMs: this.policy().unsubscribeAttemptTimeoutMs },
      },
    });

    const alarms = new DurabilityAlarms({
      scheduler,
      // Hack that forces our top level router DO alarm to run. That alarm deletes storage.
      // We don't delete storage in this class.
      handlers: { wakeUp: (): undefined => undefined },
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
    await this.require().calls.unsubscribeSenders({ id: CLOSE_ID, payload: senders });
    await this.scheduleWakeUp();
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
