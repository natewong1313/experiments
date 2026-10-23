import { setTimeout as sleep } from "node:timers/promises";
import { expect, it } from "vitest";
import type { LifecycleJob, LifecycleJobPushOptions, LifecycleJobs } from "agents/lifecycle";
import { resolvePolicies } from "../src/session/alarm-scheduler";
import type {
  SessionAlarmHandler,
  SessionAlarmInfo,
  SessionAlarmPolicy,
  SessionAlarmScheduler,
} from "../src/session/alarm-scheduler";
import { LifecycleSessionAlarms } from "../src/helpers";

const FIRST_TIME = 10;
const LATER_TIME = 20;
const HANDLER_TIME = 500;
const SHORT_TIMEOUT_MS = 10;
// A handler that hangs waits longer than any attempt timeout of these tests.
const HANG_MS = 60_000;
const SECOND_ATTEMPT = 2;

function noDelay(): number {
  return 0;
}

function succeed(): void {
  // The attempt succeeds at once.
}

/** Waits until the attempt aborts. */
async function hang({ signal }: SessionAlarmInfo): Promise<void> {
  await sleep(HANG_MS, null, { signal });
}

/**
 * The capability with an in-memory job queue in place of the Lifecycle. Its scheduler runs
 * `handler` as `continueTurn` with `policy`.
 */
class TestAlarms extends LifecycleSessionAlarms {
  readonly queue: Map<string, LifecycleJob> = new Map();
  private sessionScheduler: SessionAlarmScheduler;

  constructor(handler: SessionAlarmHandler, policy: Partial<SessionAlarmPolicy> = {}) {
    super({
      abort: (): never => {
        throw new Error("The test object does not restart");
      },
    });

    this.sessionScheduler = this.scheduler({
      handlers: {
        syncCatalog: succeed,
        flushSubscribers: succeed,
        checkSubscribers: succeed,
        finishCreate: succeed,
        finishDispose: succeed,
        continueTurn: handler,
      },
      policies: resolvePolicies({ continueTurn: { delay: noDelay, ...policy } }),
    });
  }

  async scheduleTurn(time: number): Promise<void> {
    await this.sessionScheduler.schedule("continueTurn", time);
  }

  /** Runs the stored `continueTurn` job, as the Lifecycle does when it is due. */
  async runJob(): Promise<void> {
    const job = this.queue.get("continueTurn");

    if (!job) {
      throw new Error("No continueTurn job");
    }

    await this.onJob({ job, attempt: 1 });
  }

  protected override jobs(): Pick<LifecycleJobs, "push" | "get"> {
    return {
      push: async (options: LifecycleJobPushOptions): Promise<LifecycleJob> => {
        const job: LifecycleJob = {
          id: options.id ?? crypto.randomUUID(),
          capability: this.capabilityId,
          fn: options.fn,
          time: options.time,
          payload: options.payload,
          retry: options.retry,
          singleflight: options.singleflight === true,
          exclusive: false,
          recoveryLoop: false,
          createdAt: 0,
        };

        this.queue.set(job.id, job);

        return job;
      },
      get: (id: string): LifecycleJob | undefined => this.queue.get(id),
    };
  }
}

it("replaces the pending job when a name is scheduled again", async () => {
  const alarms = new TestAlarms(succeed);

  await alarms.scheduleTurn(FIRST_TIME);
  await alarms.scheduleTurn(LATER_TIME);

  expect([...alarms.queue.values()]).toMatchObject([
    { id: "continueTurn", fn: "continueTurn", time: LATER_TIME, retry: { maxAttempts: 1 } },
  ]);
});

it("schedules a failed attempt again with the next attempt number", async () => {
  const attempts: number[] = [];

  const alarms = new TestAlarms(
    ({ attempt }) => {
      attempts.push(attempt);

      throw new Error("Transient failure");
    },
    { maxAttempts: SECOND_ATTEMPT },
  );

  await alarms.scheduleTurn(0);
  await alarms.runJob();
  expect(alarms.queue.get("continueTurn")?.payload).toMatchObject({ attempt: SECOND_ATTEMPT });

  // The last attempt fails the occurrence, and no retry follows.
  await alarms.runJob();
  expect(attempts).toEqual([1, SECOND_ATTEMPT]);
  expect(alarms.queue.get("continueTurn")?.payload).toMatchObject({ attempt: SECOND_ATTEMPT });
});

it("keeps an occurrence that the handler scheduled when its attempt fails", async () => {
  const alarms: TestAlarms = new TestAlarms(async () => {
    await alarms.scheduleTurn(HANDLER_TIME);

    throw new Error("Transient failure");
  });

  await alarms.scheduleTurn(0);
  await alarms.runJob();

  expect(alarms.queue.get("continueTurn")).toMatchObject({
    time: HANDLER_TIME,
    payload: { attempt: 1 },
  });
});

it("ends a timed-out attempt, and retries it only if the policy allows", async () => {
  const final = new TestAlarms(hang, { attemptTimeoutMs: SHORT_TIMEOUT_MS });
  await final.scheduleTurn(0);
  await final.runJob();
  expect(final.queue.get("continueTurn")?.payload).toMatchObject({ attempt: 1 });

  const retried = new TestAlarms(hang, { attemptTimeoutMs: SHORT_TIMEOUT_MS, retryTimeouts: true });
  await retried.scheduleTurn(0);
  await retried.runJob();
  expect(retried.queue.get("continueTurn")?.payload).toMatchObject({ attempt: SECOND_ATTEMPT });
});
