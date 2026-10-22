import type { ChannelState as AHPChannelState } from "@experiments/protocol-schemas/ahp";
import type { Stubs } from ".";
import { callDoRpc } from "../../shared/do-rpc";
import { AHPError } from "../../shared/protocol";
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

  /**
   * Subscribes the router to a channel at its sender and returns the channel snapshot. Makes no
   * new attempt after `isCurrent` returns false. An attempt after the close could reach the
   * sender after the close, and leave a subscription that no one removes.
   *
   * @throws {AHPError} If `isCurrent` returns false before an attempt.
   */
  async subscribe(
    sender: Sender,
    channel: string,
    isCurrent: () => boolean,
  ): Promise<SenderSnapshot> {
    function requireCurrent(): void {
      if (!isCurrent()) {
        throw new AHPError("Connection is closed");
      }
    }

    switch (sender.senderType) {
      case "host": {
        const rootSnapshot = await callDoRpc(
          () => this.stubs.host(),
          async (host) => {
            requireCurrent();

            return await host.subscribeRoot({ router: this.routerName });
          },
        );

        return { channel, sender, ...rootSnapshot };
      }

      case "session": {
        const sessionSnapshot = await callDoRpc(
          () => this.stubs.session(sender.sessionId),
          async (stub) => {
            requireCurrent();

            return await stub.subscribe({ router: this.routerName, channel });
          },
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
    await Promise.allSettled(
      senders.map(async ({ sender, channels }) => {
        await this.unsubscribe(sender, channels);
      }),
    );
  }

  /**
   * Tells a sender that the connection of this router closed. The sender removes all
   * subscriptions of the router and rejects its later subscribe requests.
   */
  async close(sender: Sender): Promise<void> {
    const req = { router: this.routerName };

    switch (sender.senderType) {
      case "host": {
        await callDoRpc(
          () => this.stubs.host(),
          (host) => host.routerClosed(req),
        );

        break;
      }

      case "session": {
        await callDoRpc(
          () => this.stubs.session(sender.sessionId),
          (session) => session.routerClosed(req),
        );

        break;
      }
    }
  }

  /**
   * Tells each sender that the connection of this router closed. A failure at one sender does
   * not stop the calls to the other senders.
   *
   * @throws {AggregateError} If a sender fails.
   */
  async closeEach(senders: SenderChannels): Promise<void> {
    const results = await Promise.allSettled(
      senders.map(async ({ sender }) => {
        await this.close(sender);
      }),
    );

    const errors: unknown[] = [];

    for (const result of results) {
      if (result.status === "rejected") {
        errors.push(result.reason);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, "Close failed");
    }
  }
}
