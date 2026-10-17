import { errorMessage } from "./errors";

/** Sends a batch of items to one router. Throws if the router cannot be reached. */
type Deliver<Item> = (router: string, items: Item[]) => Promise<void>;

/** Runs after a router cannot be reached. The queue discards the items of that router. */
type OnFailure = (router: string) => void;

type PushQueueOptions<Item> = { deliver: Deliver<Item>; onFailure: OnFailure };

/**
 * Keeps one in-memory queue of pushes for each router. Each router has at most one batch in
 * flight. Items queued while a batch is in flight go in the next batch, in order.
 *
 * The queue is not durable. A sender that restarts finds its lagging routers from storage.
 */
export class PushQueue<Item> {
  private queues: Map<string, Item[]> = new Map();
  private running: Map<string, Promise<void>> = new Map();
  private deliver: Deliver<Item>;
  private onFailure: OnFailure;

  constructor(options: PushQueueOptions<Item>) {
    this.deliver = options.deliver;
    this.onFailure = options.onFailure;
  }

  /** Adds an item to the queue of the router and starts sending if no batch is in flight. */
  push(router: string, item: Item): void {
    const queue = this.queues.get(router) ?? [];
    queue.push(item);
    this.queues.set(router, queue);

    if (!this.running.has(router)) {
      this.running.set(router, this.drain(router));
    }
  }

  /** Returns true if the router has queued or in-flight items. */
  isActive(router: string): boolean {
    return this.running.has(router);
  }

  /** Returns true if any router has queued or in-flight items. */
  hasWork(): boolean {
    return this.running.size > 0;
  }

  /** Discards the queued items of a router. A batch in flight still completes. */
  drop(router: string): void {
    this.queues.delete(router);
  }

  /** Resolves after every router has sent its queued items. */
  async idle(): Promise<void> {
    while (this.running.size > 0) {
      // Each pass waits for the batches that were in flight at its start.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await Promise.allSettled(this.running.values());
    }
  }

  /**
   * Sends batches until the queue is empty. The queue always has an item when this starts, so
   * `push` stores the promise before the `finally` block removes it.
   */
  private async drain(router: string): Promise<void> {
    try {
      for (let items = this.take(router); items.length > 0; items = this.take(router)) {
        // A router must receive each batch before the next one.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await this.deliver(router, items);
      }
    } catch (error) {
      console.error("Router push failed", { router, error: errorMessage(error) });
      this.queues.delete(router);
      this.onFailure(router);
    } finally {
      // Runs in the same turn as the last `take`, so a later `push` starts a new drain.
      this.running.delete(router);
    }
  }

  private take(router: string): Item[] {
    const items = this.queues.get(router) ?? [];
    this.queues.delete(router);

    return items;
  }
}
