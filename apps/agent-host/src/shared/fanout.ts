import { and, eq, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import { callDoRpc } from "./do-rpc";
import type { StubFor } from "./stubs";
import { PushQueue } from "./push-queue";
import { AHPError } from "./protocol";
import type { DurableObjectDatabase } from "./db/do-database";
import {
  closedRoutersTable,
  subscriberChannelsTable,
  subscriberCheckTable,
  subscriberRoutersTable,
} from "./db/fanout-schema";

/** An item that a sender pushes. Each item has its own revision. */
export type FanoutItem = { revision: number };

/** Sends pushes of one kind of sender to a router. */
export type FanoutSender<Item extends FanoutItem> = {
  /**
   * Sends consecutive items in order, with only the actions of `channels`. Returns the channels
   * that the router still subscribes to.
   */
  send(router: StubFor<"router">, items: Item[], channels: ReadonlySet<string>): Promise<string[]>;

  /**
   * Tells the router that the sender is at `revision`. A router that has an older revision
   * finds a gap. Returns the channels that the router still subscribes to.
   */
  gap(router: StubFor<"router">, revision: number): Promise<string[]>;
};

type RouterFanoutOptions<Item extends FanoutItem> = {
  database: DurableObjectDatabase;
  sender: FanoutSender<Item>;
  router(name: string): StubFor<"router">;
  /** Schedules the `flushSubscribers` alarm of the sender at `time`. */
  scheduleFlush(time: number): Promise<void>;
  /** Schedules the `checkSubscribers` alarm of the sender at `time`. */
  scheduleCheck(time: number): Promise<void>;
};

/** The subscriptions of a router when a push was sent. */
type SentChannels = { channels: string[]; lastId: number };

/**
 * The delay before a sender checks for routers that missed updates. The delay is longer than
 * the 15-second window in which `durability` runs alarms from an in-memory timer. A pending
 * timer keeps the Durable Object in memory.
 */
const FLUSH_DELAY_MS = 30_000;
const LAST = -1;

/** The `checkSubscribers` alarm runs at one-hour intervals while routers remain. */
export const CHECK_INTERVAL_MS = 3_600_000;

/**
 * A sender keeps a closed-router record for at least one hour. The next close or subscriber
 * check deletes expired records. The sender then accepts subscribe requests from those routers.
 */
export const CLOSED_ROUTER_TTL_MS = 3_600_000;

/**
 * Stores the routers that subscribe to a sender and pushes each revision to them in order.
 * The host uses it for the root channel, and each session uses it for its channels.
 *
 * Pushes are best effort. The fanout removes a router that it cannot reach after the RPC
 * retries. The queue is in memory only. After a restart, the `flushSubscribers` alarm tells
 * lagging routers about the gap.
 *
 * A hibernating router can discover a missing WebSocket when a sender calls it. The
 * `checkSubscribers` alarm checks routers without active pushes every `CHECK_INTERVAL_MS`, even
 * when the sender has no updates. A closed router replies with no channels, and the fanout
 * removes it.
 */
export class RouterFanout<Item extends FanoutItem> {
  private options: RouterFanoutOptions<Item>;
  private database: DurableObjectDatabase;
  private queue: PushQueue<Item>;
  private flushScheduled = false;
  private runningCheck: Promise<void> = Promise.resolve();

  constructor(options: RouterFanoutOptions<Item>) {
    this.options = options;
    this.database = options.database;

    this.queue = new PushQueue({
      deliver: async (router, items): Promise<void> => {
        await this.deliver(router, items);
      },
      onFailure: (router): void => {
        this.remove(router);
      },
    });
  }

  /**
   * Subscribes a router to a channel. A new router starts at `revision`. Call this in the
   * transaction that reads the snapshot at `revision`. Then call `scheduleCheck`.
   *
   * @throws {AHPError} If the router closed.
   */
  subscribe(router: string, channel: string, revision: number): void {
    const existing = and(
      eq(subscriberChannelsTable.router, router),
      eq(subscriberChannelsTable.channel, channel),
    );

    this.database.storage.transactionSync(() => {
      if (this.isClosed(router)) {
        throw new AHPError("Router is closed");
      }

      this.database.orm
        .insert(subscriberRoutersTable)
        .values({ router, deliveredRevision: revision })
        .onConflictDoNothing()
        .run();

      // The new row gets a new ID. This prevents a reply to an earlier push from removing it.
      this.database.orm.delete(subscriberChannelsTable).where(existing).run();
      this.database.orm.insert(subscriberChannelsTable).values({ router, channel }).run();
    });
  }

  /** Removes subscriptions of a router, and the router when it has none left. */
  unsubscribe(router: string, channels: string[]): void {
    const removed = and(
      eq(subscriberChannelsTable.router, router),
      inArray(subscriberChannelsTable.channel, channels),
    );

    this.database.storage.transactionSync(() => {
      this.database.orm.delete(subscriberChannelsTable).where(removed).run();

      if (this.removeIfUnused(router)) {
        this.queue.drop(router);
      }
    });
  }

  /**
   * Removes a router and all its subscriptions. Rejects later subscribe requests until a close
   * or subscriber check deletes its expired closed-router record. The router calls this after
   * its connection closes.
   */
  close(router: string): void {
    const now = Date.now();

    this.database.storage.transactionSync(() => {
      this.deleteRouter(router);
      this.database.orm
        .insert(closedRoutersTable)
        .values({ router, closedAt: now })
        .onConflictDoNothing()
        .run();
      this.pruneClosedRouters(now);
    });
    this.queue.drop(router);
  }

  /** Returns the subscribed routers. */
  routers(): string[] {
    const rows = this.database.orm
      .select({ router: subscriberRoutersTable.router })
      .from(subscriberRoutersTable)
      .all();

    return rows.map((row) => row.router);
  }

  /** Queues the items for every subscribed router and schedules a check for lost pushes. */
  async publish(items: Item[]): Promise<void> {
    const routers = this.routers();

    if (routers.length === 0 || items.length === 0) {
      return;
    }

    for (const router of routers) {
      for (const item of items) {
        this.queue.push(router, item);
      }
    }

    await this.scheduleFlush();
  }

  /** Waits for queued pushes and the running subscriber check to settle, including failures. */
  async idle(): Promise<void> {
    await this.queue.idle();
    await Promise.allSettled([this.runningCheck]);
  }

  /**
   * After a restart, schedules an immediate check if a router did not receive `revision`.
   * A restart loses the pushes in flight.
   */
  async recover(revision: number): Promise<void> {
    if (this.lagging(revision).length > 0) {
      await this.options.scheduleFlush(Date.now());
    }

    if (this.routers().length > 0) {
      await this.scheduleCheck();
    }
  }

  /**
   * Schedules the `checkSubscribers` alarm in `CHECK_INTERVAL_MS`, unless a check is already scheduled.
   * This prevents subscriptions from postponing an existing check, including one that is due.
   */
  async scheduleCheck(): Promise<void> {
    if (this.database.orm.select().from(subscriberCheckTable).get()) {
      return;
    }

    // Schedule the alarm before storing its marker. A restart between these writes can then schedule it again.
    await this.options.scheduleCheck(Date.now() + CHECK_INTERVAL_MS);
    this.database.orm.insert(subscriberCheckTable).values({ id: 1 }).onConflictDoNothing().run();
  }

  /**
   * Runs the `checkSubscribers` alarm. Tells each router without active pushes that the sender
   * is at `revision`. Removes channels that the router no longer subscribes to. If a call fails,
   * the router remains subscribed for the next check. Deletes expired closed-router records
   * and schedules the next check while subscribed routers remain.
   */
  async check(revision: number): Promise<void> {
    const running = this.runCheck(revision);
    this.runningCheck = running;
    await running;
  }

  private async runCheck(revision: number): Promise<void> {
    this.database.storage.transactionSync(() => {
      this.database.orm.delete(subscriberCheckTable).run();
      this.pruneClosedRouters(Date.now());
    });

    const idle = this.routers().filter((router) => !this.queue.isActive(router));

    await Promise.allSettled(
      idle.map(async (router) => {
        const sent = this.channels(router);

        const subscribed = await callDoRpc(
          () => this.options.router(router),
          async (stub) => await this.options.sender.gap(stub, revision),
        );

        this.acknowledge(router, revision, sent, subscribed);
      }),
    );

    if (this.routers().length > 0) {
      await this.scheduleCheck();
    }
  }

  /**
   * Runs the `flushSubscribers` alarm. Tells each lagging router without pushes in flight
   * that the sender is at `revision`. The router finds the gap and closes its WebSocket.
   * Schedules another check while pushes are in flight.
   */
  async flush(revision: number): Promise<void> {
    this.flushScheduled = false;
    const lagging = this.lagging(revision).filter((router) => !this.queue.isActive(router));

    await Promise.allSettled(
      lagging.map(async (router) => {
        const sent = this.channels(router);

        try {
          const subscribed = await callDoRpc(
            () => this.options.router(router),
            async (stub) => await this.options.sender.gap(stub, revision),
          );

          this.acknowledge(router, revision, sent, subscribed);
        } catch {
          this.remove(router);
        }
      }),
    );

    if (this.queue.hasWork()) {
      await this.scheduleFlush();
    }
  }

  /** Forgets the in-memory state after the sender deletes its storage. */
  reset(): void {
    this.flushScheduled = false;
  }

  /** Schedules one `flushSubscribers` alarm while pushes are in flight. */
  private async scheduleFlush(): Promise<void> {
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      await this.options.scheduleFlush(Date.now() + FLUSH_DELAY_MS);
    }
  }

  /**
   * Sends a batch with the actions of the router's channels. Removes the router if it has no
   * channels.
   */
  private async deliver(router: string, items: Item[]): Promise<void> {
    const sent = this.channels(router);
    const last = items.at(LAST);

    if (sent.channels.length === 0 || last === undefined) {
      this.remove(router);

      return;
    }

    const channels = new Set(sent.channels);

    const subscribed = await callDoRpc(
      () => this.options.router(router),
      async (stub) => await this.options.sender.send(stub, items, channels),
    );

    if (!this.acknowledge(router, last.revision, sent, subscribed)) {
      this.queue.drop(router);
    }
  }

  /**
   * Records a delivered revision and removes the channels that the router no longer subscribes
   * to. Keeps subscriptions made after the push was sent. Returns false and removes the router
   * if it has no channels left.
   */
  private acknowledge(
    router: string,
    revision: number,
    sent: SentChannels,
    subscribed: string[],
  ): boolean {
    const unsubscribed = and(
      eq(subscriberChannelsTable.router, router),
      lte(subscriberChannelsTable.id, sent.lastId),
      notInArray(subscriberChannelsTable.channel, subscribed),
    );

    return this.database.storage.transactionSync(() => {
      this.database.orm.delete(subscriberChannelsTable).where(unsubscribed).run();

      if (this.removeIfUnused(router)) {
        return false;
      }

      // A push that the router acknowledged during this call can have a higher revision.
      this.database.orm
        .update(subscriberRoutersTable)
        .set({
          deliveredRevision: sql`max(${subscriberRoutersTable.deliveredRevision}, ${revision})`,
        })
        .where(eq(subscriberRoutersTable.router, router))
        .run();

      return true;
    });
  }

  private lagging(revision: number): string[] {
    const rows = this.database.orm
      .select({ router: subscriberRoutersTable.router })
      .from(subscriberRoutersTable)
      .where(lt(subscriberRoutersTable.deliveredRevision, revision))
      .all();

    return rows.map((row) => row.router);
  }

  private channels(router: string): SentChannels {
    const rows = this.database.orm
      .select({ id: subscriberChannelsTable.id, channel: subscriberChannelsTable.channel })
      .from(subscriberChannelsTable)
      .where(eq(subscriberChannelsTable.router, router))
      .all();

    return {
      channels: rows.map((row) => row.channel),
      lastId: Math.max(0, ...rows.map((row) => row.id)),
    };
  }

  /** Removes a router and its subscriptions, and discards its queued items. */
  private remove(router: string): void {
    this.database.storage.transactionSync(() => {
      this.deleteRouter(router);
    });
    this.queue.drop(router);
  }

  /** Deletes the rows of a router and its subscriptions. Call it in a transaction. */
  private deleteRouter(router: string): void {
    this.database.orm
      .delete(subscriberChannelsTable)
      .where(eq(subscriberChannelsTable.router, router))
      .run();
    this.database.orm
      .delete(subscriberRoutersTable)
      .where(eq(subscriberRoutersTable.router, router))
      .run();
  }

  private isClosed(router: string): boolean {
    const row = this.database.orm
      .select({ router: closedRoutersTable.router })
      .from(closedRoutersTable)
      .where(eq(closedRoutersTable.router, router))
      .get();

    return row !== undefined;
  }

  /** Deletes the closed routers that are older than `CLOSED_ROUTER_TTL_MS`. */
  private pruneClosedRouters(now: number): void {
    this.database.orm
      .delete(closedRoutersTable)
      .where(lt(closedRoutersTable.closedAt, now - CLOSED_ROUTER_TTL_MS))
      .run();
  }

  /** Removes a router without subscriptions. Returns true if it removed the router. */
  private removeIfUnused(router: string): boolean {
    const remaining = this.database.orm
      .select({ channel: subscriberChannelsTable.channel })
      .from(subscriberChannelsTable)
      .where(eq(subscriberChannelsTable.router, router))
      .get();

    if (remaining) {
      return false;
    }

    this.database.orm
      .delete(subscriberRoutersTable)
      .where(eq(subscriberRoutersTable.router, router))
      .run();

    return true;
  }
}
