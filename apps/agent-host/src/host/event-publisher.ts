import { RouterFanout } from "../shared/fanout";
import type { HostDatabase } from "./db/database";
import type { StubFor } from "../shared/stubs";
import type { AgentHostConnectionRouterRPC, RootUpdate } from "../shared/rpc/router";
import { ROOT_CHANNEL } from "../shared/protocol";

type RouterStub = StubFor<"router">;

type EventsPublisherOptions<Router extends AgentHostConnectionRouterRPC> = {
  db: HostDatabase;
  router(): DurableObjectNamespace<Router>;
  /* We flush the current revision */
  scheduleFlush(time: number): Promise<void>;
};

/**
 * Handles sending events to any dependent AgentHostRouter connections.
 */
export class EventsPublisher<
  Router extends AgentHostConnectionRouterRPC = AgentHostConnectionRouterRPC,
> {
  private fanout: RouterFanout<RootUpdate>;

  constructor(options: EventsPublisherOptions<Router>) {
    this.fanout = new RouterFanout<RootUpdate>({
      database: options.db,
      router: (name): RouterStub => options.router().getByName(name),
      sender: {
        send: async (stub, updates, channels): Promise<string[]> =>
          await this.send(stub, updates, channels),
        gap: async (stub, revision): Promise<string[]> => {
          const result = await stub.rootUpdate({ after: revision, updates: [] });

          return result.subscribed;
        },
      },
      scheduleFlush: (time): Promise<void> => options.scheduleFlush(time),
    });
  }

  subscribe(router: string, revision: number): void {
    this.fanout.subscribe(router, ROOT_CHANNEL, revision);
  }

  unsubscribe(router: string): void {
    this.fanout.unsubscribe(router, [ROOT_CHANNEL]);
  }

  async publish(items: RootUpdate[]): Promise<void> {
    await this.fanout.publish(items);
  }

  async recover(revision: number): Promise<void> {
    await this.fanout.recover(revision);
  }

  async flush(revision: number): Promise<void> {
    await this.fanout.flush(revision);
  }

  /** Sends consecutive root revisions to a router in one push. */
  private async send(
    stub: RouterStub,
    updates: RootUpdate[],
    channels: ReadonlySet<string>,
  ): Promise<string[]> {
    const [first] = updates;

    if (first === undefined) {
      return [...channels];
    }

    const result = await stub.rootUpdate({ after: first.revision - 1, updates });

    return result.subscribed;
  }
}
