import { callDoRpc } from "../shared/do-rpc";
import { RouterFanout } from "../shared/fanout";
import type { StubFor } from "../shared/stubs";
import type { AgentHostConnectionRouterRPC, SessionUpdate } from "../shared/rpc/router";
import type { SessionDatabase } from "./db/database";

type RouterStub = StubFor<"router">;

type UpdatesPublisherOptions<Router extends AgentHostConnectionRouterRPC> = {
  db: SessionDatabase;
  router(): DurableObjectNamespace<Router>;
  /** Returns the session ID from the Durable Object name. */
  sessionId(): string;
  scheduleFlush(time: number): Promise<void>;
  scheduleCheck(time: number): Promise<void>;
};

/**
 * Sends the session and chat updates of one session to the subscribed
 * `AgentHostConnectionRouter` connections.
 */
export class UpdatesPublisher<
  Router extends AgentHostConnectionRouterRPC = AgentHostConnectionRouterRPC,
> {
  private fanout: RouterFanout<SessionUpdate>;
  private options: UpdatesPublisherOptions<Router>;

  constructor(options: UpdatesPublisherOptions<Router>) {
    this.options = options;

    this.fanout = new RouterFanout<SessionUpdate>({
      database: options.db,
      router: (name): RouterStub => options.router().getByName(name),
      sender: {
        send: async (stub, updates, channels): Promise<string[]> =>
          await this.send(stub, updates, channels),
        gap: async (stub, revision): Promise<string[]> => {
          const sessionId = options.sessionId();
          const result = await stub.sessionActions({ sessionId, after: revision, updates: [] });

          return result.subscribed;
        },
      },
      scheduleFlush: (time): Promise<void> => options.scheduleFlush(time),
      scheduleCheck: (time): Promise<void> => options.scheduleCheck(time),
    });
  }

  subscribe(router: string, channel: string, revision: number): void {
    this.fanout.subscribe(router, channel, revision);
  }

  unsubscribe(router: string, channels: string[]): void {
    this.fanout.unsubscribe(router, channels);
  }

  close(router: string): void {
    this.fanout.close(router);
  }

  async scheduleCheck(): Promise<void> {
    await this.fanout.scheduleCheck();
  }

  async check(revision: number): Promise<void> {
    await this.fanout.check(revision);
  }

  async publish(updates: SessionUpdate[]): Promise<void> {
    await this.fanout.publish(updates);
  }

  hasSubscribers(channel: string): boolean {
    return this.fanout.hasSubscribers(channel);
  }

  isSubscribed(router: string, channel: string): boolean {
    return this.fanout.isSubscribed(router, channel);
  }

  /**
   * Waits for the router to acknowledge at least `revision` or have no queued or in-flight pushes.
   * Returns false if the router is absent or has not acknowledged that revision.
   */
  async delivered(router: string, revision: number): Promise<boolean> {
    return await this.fanout.delivered(router, revision);
  }

  async recover(revision: number): Promise<void> {
    await this.fanout.recover(revision);
  }

  async flush(revision: number): Promise<void> {
    await this.fanout.flush(revision);
  }

  /**
   * Waits for the queued updates, then tells each subscribed router that the session is
   * disposed. Ignores failed calls.
   */
  async dispose(): Promise<void> {
    const sessionId = this.options.sessionId();
    await this.fanout.idle();

    await Promise.allSettled(
      this.fanout.routers().map(async (router) => {
        await callDoRpc(
          () => this.options.router().getByName(router),
          (stub) => stub.sessionDisposed({ sessionId }),
        );
      }),
    );

    this.fanout.reset();
  }

  /** Sends consecutive session revisions to a router with only the actions of its channels. */
  private async send(
    stub: RouterStub,
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

    const result = await stub.sessionActions({
      sessionId: this.options.sessionId(),
      after: first.revision - 1,
      updates: filtered,
    });

    return result.subscribed;
  }
}
