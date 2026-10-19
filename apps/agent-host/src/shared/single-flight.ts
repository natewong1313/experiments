/**
 * Shares one running operation between callers with the same key. A caller with another key
 * starts a new operation and replaces the shared one. The replaced operation keeps running
 * for its own callers.
 */
export class SingleFlight {
  private running?: { key: string; done: Promise<void> };

  async run(key: string, operation: () => Promise<void>): Promise<void> {
    if (this.running?.key !== key) {
      this.running = { key, done: operation() };
    }

    const { running } = this;

    try {
      await running.done;
    } finally {
      if (this.running === running) {
        this.running = undefined;
      }
    }
  }
}
