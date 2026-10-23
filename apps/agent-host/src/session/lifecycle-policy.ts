import { exponential } from "durability/utils";

/** The timing of the alarms that complete a creation or a dispose, and that continue a turn. */
export type SessionLifecyclePolicy = {
  /** The delay before the first `finishCreate` run. This run also finds a creation that hangs. */
  createDeadlineMs: number;
  /** The maximum duration of one `finishCreate` attempt. */
  createAttemptTimeoutMs: number;
  /** The `finishCreate` attempts before the session fails the creation. */
  createAttempts: number;
  /** The delay of the first retry. Each later retry doubles it, up to `retryMaxDelayMs`. */
  retryInitialDelayMs: number;
  retryMaxDelayMs: number;
  /** The delay before `finishDispose` completes a dispose whose inline steps stopped. */
  disposeFallbackMs: number;
  /**
   * The interval of the `continueTurn` alarm while a turn is active. After a restart, the
   * session continues the turn at the latest after this interval.
   */
  turnHeartbeatMs: number;
  /** The failed reattachments in a row before the session ends the turn with an error. */
  turnAttempts: number;
};

export const DEFAULT_LIFECYCLE_POLICY: SessionLifecyclePolicy = {
  createDeadlineMs: 60_000,
  createAttemptTimeoutMs: 60_000,
  createAttempts: 5,
  retryInitialDelayMs: 1000,
  retryMaxDelayMs: 60_000,
  disposeFallbackMs: 30_000,
  turnHeartbeatMs: 30_000,
  turnAttempts: 5,
};

/** Returns the delay before the next attempt after `failures` failed attempts. */
export function retryDelay(policy: SessionLifecyclePolicy, failures: number): number {
  return exponential(failures, policy.retryInitialDelayMs, policy.retryMaxDelayMs);
}
