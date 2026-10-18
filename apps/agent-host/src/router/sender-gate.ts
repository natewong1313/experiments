/**
 * Holds pushes from a sender while a client frame subscribes to the channels of that sender.
 * The pushes wait until the frame ends after its reply. Thus the client receives each snapshot
 * before the later actions of its channel. Pushes from other senders do not wait.
 */
export class SenderGate {
  private holds: Map<string, Promise<null>> = new Map();

  /** Holds pushes from the sender until `until` resolves. */
  hold(sender: string, until: Promise<null>): void {
    this.holds.set(sender, until);
    void this.release(sender, until);
  }

  /** Resolves after the hold on a sender ends. */
  async settled(sender: string): Promise<void> {
    await this.holds.get(sender);
  }

  /** Removes the hold after `until` resolves, unless a later hold replaced it. */
  private async release(sender: string, until: Promise<null>): Promise<void> {
    await until;

    if (this.holds.get(sender) === until) {
      this.holds.delete(sender);
    }
  }
}
