import { LifecycleCapability } from "agents/lifecycle";
import type { LifecycleJob, LifecycleJobContext, LifecycleJobs } from "agents/lifecycle";
import * as z from "zod";
import { SESSION_ALARM_NAMES } from "../session/alarm-scheduler";
import type {
  SessionAlarmName,
  SessionAlarmScheduler,
  SessionAlarmSchedulerOptions,
} from "../session/alarm-scheduler";
import { untilAborted } from "../shared/abort";

const AlarmNameSchema = z.enum(SESSION_ALARM_NAMES);
const AlarmPayloadSchema = z.object({ occurrence: z.string(), attempt: z.int().min(1) });

type AlarmPayload = z.output<typeof AlarmPayloadSchema>;

// This treats a run as hung after this margin past its attempt timeout.
const HUNG_MARGIN_SECONDS = 30;
const MS_PER_SECOND = 1000;

/**
 * Helper to run the alarms in AgentHostSession as Lifecycle jobs.
 * When mounting a harness like PiHarness into an AgentHostSession DO, we get a conflict since the
 * harnesses lifecycle thing has its own alarms.
 *
 * Each alarm name is one job with a stable ID, so scheduling a name replaces its pending job.
 * This pushes each job with one attempt and handles retrying failed attempts after a delay, plus
 * we track the attempt count. Once a attempt times out, we continue with the next job.
 *
 * Lifecycle can run a job again while an earlier run is still running, when a replacement
 * clears the run marker. The session handlers can run again, so this is safe.
 */
export class LifecycleSessionAlarms extends LifecycleCapability {
  private ctx: Pick<DurableObjectState, "abort">;
  private options?: SessionAlarmSchedulerOptions;
  // True after the session deleted all storage, which includes the table of the job queue.
  // The queue does not create its table again in this object.
  private removed = false;

  constructor(ctx: Pick<DurableObjectState, "abort">) {
    super("agent-host-session");
    this.ctx = ctx;
  }

  scheduler(options: SessionAlarmSchedulerOptions): SessionAlarmScheduler {
    this.options = options;

    return {
      schedule: async (name, time): Promise<void> => {
        await this.schedule(name, time);
      },
      alarm: async (): Promise<void> => {
        throw new Error("The Lifecycle of this object owns the Durable Object alarm");
      },
      removed: (): void => {
        this.removed = true;
        this.options = undefined;
      },
    };
  }

  async onJob({ job }: LifecycleJobContext): Promise<void> {
    const name = AlarmNameSchema.safeParse(job.fn);
    const payload = AlarmPayloadSchema.safeParse(job.payload);

    if (!name.success || !payload.success || !this.options) {
      return;
    }

    await this.run(job, name.data, payload.data, this.options);
  }

  private async schedule(name: SessionAlarmName, time: number): Promise<void> {
    if (this.removed) {
      this.ctx.abort("The session storage was deleted");
      throw new Error("The session storage was deleted");
    }

    await this.push(name, time, { occurrence: crypto.randomUUID(), attempt: 1 });
  }

  private async run(
    job: LifecycleJob,
    name: SessionAlarmName,
    payload: AlarmPayload,
    { handlers, policies }: SessionAlarmSchedulerOptions,
  ): Promise<void> {
    const policy = policies[name];
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort(new Error(`Session alarm ${name} timed out`));
    }, policy.attemptTimeoutMs);

    try {
      const attempt = Promise.resolve(
        handlers[name]({ signal: controller.signal, attempt: payload.attempt }),
      );

      await untilAborted(attempt, controller.signal);
    } catch (error) {
      const timedOut = controller.signal.aborted;

      if ((timedOut && !policy.retryTimeouts) || payload.attempt >= policy.maxAttempts) {
        console.error(`Session alarm ${name} failed`, { error: String(error) });

        return;
      }

      if (!this.isCurrent(job.id, payload)) {
        return;
      }

      const delay = policy.delay(payload.attempt);
      await this.push(name, Date.now() + delay, { ...payload, attempt: payload.attempt + 1 });
    } finally {
      clearTimeout(timeout);
    }
  }

  protected jobs(): Pick<LifecycleJobs, "push" | "get"> {
    return this.lifecycle.jobs;
  }

  private isCurrent(id: string, payload: AlarmPayload): boolean {
    const stored = AlarmPayloadSchema.safeParse(this.jobs().get(id)?.payload);

    return stored.success && stored.data.occurrence === payload.occurrence;
  }

  private async push(name: SessionAlarmName, time: number, payload: AlarmPayload): Promise<void> {
    const policy = this.options?.policies[name];
    const timeoutSeconds = Math.ceil((policy?.attemptTimeoutMs ?? 0) / MS_PER_SECOND);

    await this.jobs().push({
      id: name,
      fn: name,
      time,
      payload,
      retry: { maxAttempts: 1 },
      singleflight: true,
      hungTimeoutSeconds: timeoutSeconds + HUNG_MARGIN_SECONDS,
    });
  }
}
