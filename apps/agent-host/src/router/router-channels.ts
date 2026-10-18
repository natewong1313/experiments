import { eq, sql } from "drizzle-orm";
import type { RouterDatabase } from "./db/database";
import { connectionTable, sendersTable, subscriptionsTable } from "./db/schema";

type Subscription = { channel: string; sender: string; revision: number };

/** One revision of a sender, with an item for each action or notification. */
export type SenderRevision<Item> = { revision: number; items: Item[] };

/** The result of a push. `items` are the new items of the subscribed channels. */
type Receipt<Item> =
  | { kind: "unknown" }
  | { kind: "gap" }
  | { kind: "accepted"; items: Item[]; subscribed: string[] };

/**
 * Stores the subscriptions of one client connection and the last revision that the router
 * received from each sender. It also allocates the `serverSeq` of the connection.
 *
 * Storage exists only while the connection is open. The router opens and closes the
 * connection.
 */
export class RouterChannels {
  private db: RouterDatabase;
  private seq?: number;

  constructor(db: RouterDatabase) {
    this.db = db;
  }

  /** Returns the last `serverSeq` sent to the client, or 0 before the first. */
  serverSeq(): number {
    this.seq ??=
      this.db.orm.select({ serverSeq: connectionTable.serverSeq }).from(connectionTable).get()
        ?.serverSeq ?? 0;

    return this.seq;
  }

  /** Allocates `count` consecutive sequences with one write and returns the first. */
  allocate(count: number): number {
    const first = this.serverSeq() + 1;

    if (count === 0) {
      return first;
    }

    const last = this.serverSeq() + count;

    this.db.orm
      .insert(connectionTable)
      .values({ id: 1, serverSeq: last })
      .onConflictDoUpdate({ target: connectionTable.id, set: { serverSeq: last } })
      .run();
    this.seq = last;

    return first;
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

  /**
   * Stores a subscription and returns the `fromSeq` of its snapshot.
   *
   * The sender row keeps the lowest snapshot revision of the sender. The router treats each
   * revision up to that value as received. Each subscription skips the actions that its own
   * snapshot contains. Within one session, a snapshot revision is never lower than the
   * revisions that the session pushed. Thus a lower snapshot revision comes from a new
   * session with the same ID, and the router starts again from that revision.
   */
  subscribe(subscription: Subscription): number {
    this.db.transactionSync(() => {
      this.db.orm
        .insert(sendersTable)
        .values({ id: subscription.sender, revision: subscription.revision })
        .onConflictDoUpdate({
          target: sendersTable.id,
          set: { revision: sql`min(${sendersTable.revision}, excluded.revision)` },
        })
        .run();
      this.db.orm
        .insert(subscriptionsTable)
        .values(subscription)
        .onConflictDoUpdate({
          target: subscriptionsTable.channel,
          set: { sender: subscription.sender, revision: subscription.revision },
        })
        .run();
    });

    return this.serverSeq();
  }

  /**
   * Removes a subscription and returns its sender. Removes the sender when it has no
   * subscriptions left. Returns undefined if the client did not subscribe to the channel.
   */
  unsubscribe(channel: string): string | undefined {
    return this.db.transactionSync(() => {
      const removed = this.db.orm
        .delete(subscriptionsTable)
        .where(eq(subscriptionsTable.channel, channel))
        .returning({ sender: subscriptionsTable.sender })
        .get();

      if (removed) {
        this.removeSenderIfUnused(removed.sender);
      }

      return removed?.sender;
    });
  }

  /** Removes a sender and its subscriptions. */
  removeSender(sender: string): void {
    this.db.transactionSync(() => {
      this.db.orm.delete(subscriptionsTable).where(eq(subscriptionsTable.sender, sender)).run();
      this.db.orm.delete(sendersTable).where(eq(sendersTable.id, sender)).run();
    });
  }

  /** Returns the subscribed channels of each sender. */
  senders(): Map<string, string[]> {
    const senders: Map<string, string[]> = new Map();
    const rows = this.db.orm.select().from(subscriptionsTable).all();

    for (const row of rows) {
      senders.set(row.sender, [...(senders.get(row.sender) ?? []), row.channel]);
    }

    return senders;
  }

  /**
   * Applies a push of consecutive revisions after revision `after`. Skips revisions that the
   * router has, and items that a channel snapshot contains. Reports a gap if a revision is
   * missing. Reports `unknown` if the client has no subscriptions at the sender.
   */
  receive<Item extends { channel: string }>(
    sender: string,
    after: number,
    revisions: SenderRevision<Item>[],
  ): Receipt<Item> {
    return this.db.transactionSync((): Receipt<Item> => {
      const received = this.revision(sender);

      if (received === undefined) {
        return { kind: "unknown" };
      }

      if (after > received) {
        return { kind: "gap" };
      }

      const snapshots = this.snapshots(sender);
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
        .where(eq(sendersTable.id, sender))
        .run();

      return { kind: "accepted", items, subscribed: [...snapshots.keys()] };
    });
  }

  /** Deletes all storage of the router. */
  async clear(): Promise<void> {
    this.seq = undefined;
    await this.db.deleteAll();
  }

  private revision(sender: string): number | undefined {
    return this.db.orm
      .select({ revision: sendersTable.revision })
      .from(sendersTable)
      .where(eq(sendersTable.id, sender))
      .get()?.revision;
  }

  /** Returns the snapshot revision of each channel of a sender. */
  private snapshots(sender: string): Map<string, number> {
    const rows = this.db.orm
      .select({ channel: subscriptionsTable.channel, revision: subscriptionsTable.revision })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.sender, sender))
      .all();

    return new Map(rows.map((row) => [row.channel, row.revision]));
  }

  private removeSenderIfUnused(sender: string): void {
    const remaining = this.db.orm
      .select({ channel: subscriptionsTable.channel })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.sender, sender))
      .get();

    if (!remaining) {
      this.db.orm.delete(sendersTable).where(eq(sendersTable.id, sender)).run();
    }
  }
}
