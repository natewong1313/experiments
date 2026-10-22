import { eq, sql } from "drizzle-orm";
import type { RouterDatabase } from "../db/database";
import {
  pendingSubscriptionsTable,
  sendersTable,
  subscriptionSetupTable,
  subscriptionsTable,
} from "../db/schema";
import { senderFromKey, senderKey } from "../sender";
import type { ChannelSender, Sender } from "../sender";

/** A channel subscription and the sender revision of its snapshot. */
export type Subscription = ChannelSender & { revision: number };

/** One revision of a sender, with an item for each action or notification. */
export type SenderRevision<Item> = { revision: number; items: Item[] };

/**
 * The result of a push.
 * `items` are the new items of the subscribed channels.
 */
export type Receipt<Item> =
  | { kind: "unknown" }
  | { kind: "gap" }
  | { kind: "accepted"; items: Item[]; subscribed: string[] };

/**
 * Stores the subscriptions of one client connection and the last revision that the router
 * received from each sender. The router deletes the storage after the connection closes.
 */
export class SubscriptionStore {
  private db: RouterDatabase;

  constructor(db: RouterDatabase) {
    this.db = db;
  }

  /**
   * Stores a subscription.
   *
   * The sender row keeps the lowest snapshot revision of the sender. The router treats each
   * revision up to that value as received. Each subscription skips the actions that its own
   * snapshot contains. Within one session, a snapshot revision is never lower than the
   * revisions that the session pushed. Thus a lower snapshot revision comes from a new
   * session with the same ID, and the router starts again from that revision.
   */
  store({ channel, sender, revision }: Subscription): void {
    const key = senderKey(sender);

    this.db.transactionSync(() => {
      this.db.orm
        .insert(sendersTable)
        .values({ id: key, revision })
        .onConflictDoUpdate({
          target: sendersTable.id,
          set: { revision: sql`min(${sendersTable.revision}, excluded.revision)` },
        })
        .run();

      this.db.orm
        .insert(subscriptionsTable)
        .values({ channel, sender: key, revision })
        .onConflictDoUpdate({ target: subscriptionsTable.channel, set: { sender: key, revision } })
        .run();
    });
  }

  /**
   * Removes a subscription and returns its sender. Removes the sender when it has no
   * subscriptions left. Returns undefined if the client did not subscribe to the channel.
   */
  remove(channel: string): Sender | undefined {
    return this.db.transactionSync(() => {
      const removed = this.db.orm
        .delete(subscriptionsTable)
        .where(eq(subscriptionsTable.channel, channel))
        .returning({ sender: subscriptionsTable.sender })
        .get();

      if (!removed) {
        return;
      }

      if (this.channels(removed.sender).length === 0) {
        this.db.orm.delete(sendersTable).where(eq(sendersTable.id, removed.sender)).run();
      }

      return senderFromKey(removed.sender);
    });
  }

  /** Removes a sender and its subscriptions. */
  removeSender(sender: Sender): void {
    const key = senderKey(sender);

    this.db.transactionSync(() => {
      this.db.orm.delete(subscriptionsTable).where(eq(subscriptionsTable.sender, key)).run();
      this.db.orm.delete(sendersTable).where(eq(sendersTable.id, key)).run();
    });
  }

  /** Returns true if the client subscribes to the channel. */
  isSubscribed(channel: string): boolean {
    const row = this.db.orm
      .select({ channel: subscriptionsTable.channel })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.channel, channel))
      .get();

    return row !== undefined;
  }

  /** Returns each subscribed channel and its sender. */
  subscriptions(): ChannelSender[] {
    const rows = this.db.orm
      .select({ channel: subscriptionsTable.channel, sender: subscriptionsTable.sender })
      .from(subscriptionsTable)
      .all();

    return rows.map((row) => ({ channel: row.channel, sender: senderFromKey(row.sender) }));
  }

  /** Returns the subscribed channels of a sender. */
  channelsOf(sender: Sender): string[] {
    return this.channels(senderKey(sender));
  }

  /**
   * Applies a push of consecutive revisions after revision `after`. Skips revisions that the
   * router has, and items that a channel snapshot contains. Reports a gap if a revision is
   * missing. Reports `unknown` if the client has no subscriptions at the sender.
   */
  receive<Item extends { channel: string }>(
    sender: Sender,
    after: number,
    revisions: SenderRevision<Item>[],
  ): Receipt<Item> {
    const key = senderKey(sender);

    return this.db.transactionSync((): Receipt<Item> => {
      const received = this.revision(key);

      if (received === undefined) {
        return { kind: "unknown" };
      }

      if (after > received) {
        return { kind: "gap" };
      }

      const snapshots = this.snapshots(key);
      let last = received;
      const items: Item[] = [];

      for (const { revision, items: changes } of revisions.filter(
        (item) => item.revision > received,
      )) {
        if (revision !== last + 1) {
          return { kind: "gap" };
        }

        last = revision;

        items.push(
          ...changes.filter((item) => {
            const snapshot = snapshots.get(item.channel);

            return snapshot !== undefined && revision > snapshot;
          }),
        );
      }

      this.db.orm
        .update(sendersTable)
        .set({ revision: last })
        .where(eq(sendersTable.id, key))
        .run();

      return { kind: "accepted", items, subscribed: [...snapshots.keys()] };
    });
  }

  /**
   * Records that a subscription setup holds pushes in memory, and stores the subscriptions of
   * the setup. Call it before the router sends the subscribe requests.
   */
  startSetup(subscriptions: ChannelSender[]): void {
    this.db.transactionSync(() => {
      this.db.orm.insert(subscriptionSetupTable).values({ id: 1 }).onConflictDoNothing().run();

      for (const { channel, sender } of subscriptions) {
        this.db.orm
          .insert(pendingSubscriptionsTable)
          .values({ channel, sender: senderKey(sender) })
          .onConflictDoNothing()
          .run();
      }
    });
  }

  /** Records that no subscription setup holds pushes, and removes its subscriptions. */
  endSetup(): void {
    this.db.transactionSync(() => {
      this.db.orm.delete(subscriptionSetupTable).run();
      this.db.orm.delete(pendingSubscriptionsTable).run();
    });
  }

  /**
   * Returns the subscriptions of the setup that did not end. After a restart, they include
   * subscriptions that a sender can have accepted, but that the router did not store.
   */
  pendingSubscriptions(): ChannelSender[] {
    const rows = this.db.orm
      .select({
        channel: pendingSubscriptionsTable.channel,
        sender: pendingSubscriptionsTable.sender,
      })
      .from(pendingSubscriptionsTable)
      .all();

    return rows.map((row) => ({ channel: row.channel, sender: senderFromKey(row.sender) }));
  }

  /**
   * Returns true if a subscription setup started and did not end. At startup, this means that a
   * restart interrupted the setup and lost its held pushes.
   */
  interrupted(): boolean {
    return this.db.orm.select().from(subscriptionSetupTable).get() !== undefined;
  }

  /** Returns the subscribed channels of the sender with storage key `key`. */
  private channels(key: string): string[] {
    return this.db.orm
      .select({ channel: subscriptionsTable.channel })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.sender, key))
      .all()
      .map((row) => row.channel);
  }

  private revision(key: string): number | undefined {
    return this.db.orm
      .select({ revision: sendersTable.revision })
      .from(sendersTable)
      .where(eq(sendersTable.id, key))
      .get()?.revision;
  }

  /** Returns the snapshot revision of each channel of a sender. */
  private snapshots(key: string): Map<string, number> {
    const rows = this.db.orm
      .select({ channel: subscriptionsTable.channel, revision: subscriptionsTable.revision })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.sender, key))
      .all();

    return new Map(rows.map((row) => [row.channel, row.revision]));
  }
}
