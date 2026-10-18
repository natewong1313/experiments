import type {
  RootAction as AHPRootAction,
  SessionSummary as AHPSessionSummary,
} from "@experiments/protocol-schemas/ahp";
import { RouterFanout } from "../shared/fanout";
import type { HostDatabase } from "./db/database";
import type { StubFor } from "../shared/stubs";
import type { AgentHostConnectionRouterRPC, RouterPushResponse } from "../shared/rpc/router";
import { ROOT_CHANNEL } from "../shared/protocol";

/** One change on the root channel. */
export type RootEvent =
  | { kind: "action"; action: AHPRootAction }
  | { kind: "sessionAdded"; summary: AHPSessionSummary }
  | { kind: "sessionRemoved"; session: string }
  | { kind: "sessionSummaryChanged"; session: string; changes: Partial<AHPSessionSummary> };

export type RootEventWithRevision = RootEvent & { revision: number };

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
  private fanout: RouterFanout<RootEventWithRevision>;

  constructor(options: EventsPublisherOptions<Router>) {
    this.fanout = new RouterFanout<RootEventWithRevision>({
      database: options.db,
      router: (name): RouterStub => options.router().getByName(name),
      sender: {
        send: async (stub, items): Promise<string[]> => await this.send(stub, items),
        gap: async (stub, revision): Promise<string[]> => {
          const result = await stub.rootActions({ after: revision, revision, actions: [] });

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

  async publish(items: RootEventWithRevision[]): Promise<void> {
    await this.fanout.publish(items);
  }

  async recover(revision: number): Promise<void> {
    await this.fanout.recover(revision);
  }

  async flush(revision: number): Promise<void> {
    await this.fanout.flush(revision);
  }

  private async send(stub: RouterStub, items: RootEventWithRevision[]): Promise<string[]> {
    let subscribed: string[] = [];

    for (const item of items) {
      // The host sends root changes to a router one at a time, in revision order.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const result = await this.sendItem(stub, item);
      ({ subscribed } = result);

      if (subscribed.length === 0) {
        break;
      }
    }

    return subscribed;
  }

  private async sendItem(
    stub: RouterStub,
    item: RootEventWithRevision,
  ): Promise<RouterPushResponse> {
    const position = { after: item.revision - 1, revision: item.revision };

    switch (item.kind) {
      case "action": {
        return await stub.rootActions({ ...position, actions: [item.action] });
      }

      case "sessionAdded": {
        return await stub.sessionAdded({ ...position, summary: item.summary });
      }

      case "sessionRemoved": {
        return await stub.sessionRemoved({ ...position, session: item.session });
      }

      case "sessionSummaryChanged": {
        return await stub.sessionSummaryChanged({
          ...position,
          session: item.session,
          changes: item.changes,
        });
      }
    }
  }
}
