/**
 * Holds pushes from a sender while a client frame subscribes to the channels of that sender.
 * The pushes wait until the frame releases the hold after its reply. Thus the client receives
 * each snapshot before the later actions of its channel. Pushes from other senders do not wait.
 */
export class SenderGate {
  private holds: Map<string, Promise<null>> = new Map();

  /** Holds pushes from the sender. Call the returned function to release the hold. */
  hold(sender: string): () => void {
    const { promise, resolve } = Promise.withResolvers<null>();
    this.holds.set(sender, promise);

    return (): void => {
      if (this.holds.get(sender) === promise) {
        this.holds.delete(sender);
      }

      resolve(null);
    };
  }

  /** Resolves after the hold on a sender ends. */
  async settled(sender: string): Promise<void> {
    await this.holds.get(sender);
  }
}
