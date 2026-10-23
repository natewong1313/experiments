/**
 * Runs a handler for each pushed item, one at a time and in push order. A failed run stops the
 * queue: later items are dropped, and `drain` rejects with the failure.
 */
export class OutputQueue<Item> {
  private handler: (item: Item) => Promise<void>;
  private tail: Promise<void> = Promise.resolve();
  private failure?: { error: unknown };

  constructor(handler: (item: Item) => Promise<void>) {
    this.handler = handler;
  }

  push(item: Item): void {
    this.tail = this.run(this.tail, item);
  }

  /** Runs the handler for `item` after the run of the previous item. */
  private async run(previous: Promise<void>, item: Item): Promise<void> {
    await previous;

    if (this.failure) {
      return;
    }

    try {
      await this.handler(item);
    } catch (error) {
      this.failure = { error };
    }
  }

  /**
   * Waits until the queue has run every pushed item.
   *
   * @throws {unknown} The failure of a run, if one failed.
   */
  async drain(): Promise<void> {
    await this.tail;

    if (this.failure) {
      throw this.failure.error;
    }
  }
}
