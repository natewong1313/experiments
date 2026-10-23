import { DurabilityAlarms } from "durability";
import type { DurabilityAlarmMethodOptions } from "durability";
import { exponential, jitter } from "durability/utils";

/**
 * The names of the session alarms. This array is the source of the name type, so code that
 * validates a name at run time cannot miss one.
 */
export const SESSION_ALARM_NAMES = [
  "syncCatalog",
  "flushSubscribers",
  "checkSubscribers",
  "finishCreate",
  "finishDispose",
  "continueTurn",
] as const;

/** The named alarms of a session. Scheduling a name again replaces its pending occurrence. */
export type SessionAlarmName = (typeof SESSION_ALARM_NAMES)[number];

/** One attempt of a named alarm. */
export type SessionAlarmInfo = {
  /** Aborts when the attempt exceeds `attemptTimeoutMs`. */
  signal: AbortSignal;
  /** One-based attempt of this occurrence. A restart does not reset it. */
  attempt: number;
};

export type SessionAlarmHandler = (info: SessionAlarmInfo) => void | Promise<void>;

/** The execution policy of one named alarm. */
export type SessionAlarmPolicy = {
  /** The maximum duration of one attempt. */
  attemptTimeoutMs: number;
  /** True if a timed-out attempt can run again. Otherwise a timeout ends the occurrence. */
  retryTimeouts: boolean;
  /** The total number of attempts of an occurrence, including the first. */
  maxAttempts: number;
  /** Returns the delay after failed attempt `attempt`. */
  delay(attempt: number): number;
};

/** The handlers and policies that a scheduler runs. Every alarm name has a policy. */
export type SessionAlarmSchedulerOptions = {
  handlers: Record<SessionAlarmName, SessionAlarmHandler>;
  policies: Record<SessionAlarmName, SessionAlarmPolicy>;
};

/**
 * Runs the named alarms of a session on the Durable Object alarm. The session creates a
 * scheduler each time it opens its storage, and stops using it when it deletes the storage.
 */
export type SessionAlarmScheduler = {
  /** Schedules the occurrence of `name` at `time`, and replaces a pending one. */
  schedule(name: SessionAlarmName, time: number): Promise<void>;
  /** Runs the due alarms. `AgentHostSession.alarm` calls it while the storage is open. */
  alarm(info?: AlarmInvocationInfo): Promise<void>;
  /** Runs after the session deleted all storage, which includes the stored alarms. */
  removed?(): void;
};

/** The policy of an alarm without overrides, as `durability` applies it. */
const DEFAULT_POLICY: SessionAlarmPolicy = {
  attemptTimeoutMs: 300_000,
  retryTimeouts: false,
  maxAttempts: 5,
  delay: (attempt): number => jitter(exponential(attempt)),
};

/** Returns the policy of every alarm name, with `overrides` over the default policy. */
export function resolvePolicies(
  overrides: Partial<Record<SessionAlarmName, Partial<SessionAlarmPolicy>>>,
): Record<SessionAlarmName, SessionAlarmPolicy> {
  function policy(name: SessionAlarmName): SessionAlarmPolicy {
    return { ...DEFAULT_POLICY, ...overrides[name] };
  }

  return {
    syncCatalog: policy("syncCatalog"),
    flushSubscribers: policy("flushSubscribers"),
    checkSubscribers: policy("checkSubscribers"),
    finishCreate: policy("finishCreate"),
    finishDispose: policy("finishDispose"),
    continueTurn: policy("continueTurn"),
  };
}

/**
 * Returns a scheduler that keeps the alarms in the `durability` tables and owns the Durable
 * Object alarm. `durability` runs its own migrations, so the session creates it only while
 * its storage is open.
 */
export function durabilityAlarmScheduler(
  ctx: DurableObjectState,
  { handlers, policies }: SessionAlarmSchedulerOptions,
): SessionAlarmScheduler {
  const methods = Object.fromEntries(
    Object.entries(policies).map(([name, policy]) => [name, methodOptions(policy)]),
  ) satisfies Record<string, DurabilityAlarmMethodOptions>;

  const alarms = new DurabilityAlarms({ context: ctx, handlers, methods });

  return {
    schedule: async (name, time): Promise<void> => {
      await alarms[name](time);
    },
    alarm: async (info): Promise<void> => {
      await alarms.alarm(info);
    },
  };
}

function methodOptions(policy: SessionAlarmPolicy): DurabilityAlarmMethodOptions {
  return {
    attemptTimeoutMs: policy.attemptTimeoutMs,
    retryTimeouts: policy.retryTimeouts,
    retries: {
      maxAttempts: policy.maxAttempts,
      delay: (attempt): number => policy.delay(attempt),
    },
  };
}
