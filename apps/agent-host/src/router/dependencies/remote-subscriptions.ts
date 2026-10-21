import type { ChannelState as AHPChannelState } from "@experiments/protocol-schemas/ahp";
import type { Stubs } from ".";
import { callDoRpc } from "../../shared/do-rpc";
import type { Sender, SenderChannels } from "../sender";

/** The snapshot of a channel from its sender. */
export type SenderSnapshot = {
  channel: string;
  sender: Sender;
  revision: number;
  state: AHPChannelState;
};

/**
 * Subscribes the router at its senders and unsubscribes it. The host and the sessions have
 * different subscription RPCs. This class hides the difference.
 */
export class RemoteSubscriptions {
  private routerName: string;
  private stubs: Stubs;

  constructor(routerName: string, stubs: Stubs) {
    this.routerName = routerName;
    this.stubs = stubs;
  }

  /** Subscribes the router to a channel at its sender and returns the channel snapshot. */
  async subscribe(sender: Sender, channel: string): Promise<SenderSnapshot> {
    switch (sender.senderType) {
      case "host": {
        const rootSnapshot = await callDoRpc(
          () => this.stubs.host(),
          (host) => host.subscribeRoot({ router: this.routerName }),
        );

        return { channel, sender, ...rootSnapshot };
      }

      case "session": {
        const sessionSnapshot = await callDoRpc(
          () => this.stubs.session(sender.sessionId),
          (stub) => stub.subscribe({ router: this.routerName, channel }),
        );

        return { channel, sender, ...sessionSnapshot };
      }
    }
  }

  /** Tells a sender to stop the pushes of the channels to this router. */
  async unsubscribe(sender: Sender, channels: string[]): Promise<void> {
    switch (sender.senderType) {
      case "host": {
        await callDoRpc(
          () => this.stubs.host(),
          (host) => host.unsubscribeRoot({ router: this.routerName }),
        );

        break;
      }

      case "session": {
        await callDoRpc(
          () => this.stubs.session(sender.sessionId),
          (session) => session.unsubscribe({ router: this.routerName, channels }),
        );

        break;
      }
    }
  }

  /**
   * Tells each sender to stop the pushes of its channels. The calls are best effort. A sender
   * also stops after a push to this router reports no subscriptions.
   */
  async unsubscribeAll(senders: SenderChannels): Promise<void> {
    try {
      await this.unsubscribeEach(senders);
    } catch {
      // The pushes of a sender that fails stop at its next push.
    }
  }

  /**
   * Tells each sender to stop the pushes of its channels. A failure at one sender does not
   * stop the calls to the other senders.
   *
   * @throws {AggregateError} If a sender fails.
   */
  async unsubscribeEach(senders: SenderChannels): Promise<void> {
    const results = await Promise.allSettled(
      senders.map(async ({ sender, channels }) => {
        await this.unsubscribe(sender, channels);
      }),
    );

    const errors: unknown[] = [];

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(result.reason);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "Unsubscribe failed");
    }
  }
}
