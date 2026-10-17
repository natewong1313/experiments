/**
 * Holds pushes from a sender while a client frame subscribes to the channels of that sender.
 * The pushes wait until the router sends the reply to the frame. Thus the client receives
 * each snapshot before the later actions of its channel.
 */
export class SenderGate {
  private pending: Map<string, Promise<void>> = new Map();

  /** Holds pushes from the senders until `until` settles. */
  hold(senders: string[], until: Promise<void>): void {
    const settled = settle(until);

    for (const sender of senders) {
      this.pending.set(sender, settled);
    }

    void this.release(senders, settled);
  }

  /** Resolves after the holds on a sender end. */
  async settled(sender: string): Promise<void> {
    await this.pending.get(sender);
  }

  /** Removes the holds of the senders after `settled`, unless a later hold replaced them. */
  private async release(senders: string[], settled: Promise<void>): Promise<void> {
    await settled;

    for (const sender of senders) {
      if (this.pending.get(sender) === settled) {
        this.pending.delete(sender);
      }
    }
  }
}

/** Resolves after `promise` settles, whether it resolves or rejects. */
async function settle(promise: Promise<void>): Promise<void> {
  await Promise.allSettled([promise]);
}
