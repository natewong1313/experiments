import type { ChannelState as AHPChannelState } from "@experiments/protocol-schemas/ahp";
import { callDoRpc } from "../../shared/do-rpc";
import { channelSender, ROOT_SENDER } from "../../shared/lookups";
import type { Channel } from "../../shared/lookups";
import type { StubFor } from "../../shared/stubs";

/** The snapshot of a channel from its sender. */
export type SenderSnapshot = {
  channel: string;
  sender: string;
  revision: number;
  state: AHPChannelState;
};

/** A channel URI paired with its parsed form. */
export type ParsedChannel = {
  channel: string;
  parsed: Channel;
};

type SendersOptions = {
  routerName(): string;
  host(): StubFor<"host">;
  session(sessionId: string): StubFor<"session">;
};

/**
 * Subscribes and unsubscribes this router at the senders of its channels. The host is the
 * sender of the root channel. A session is the sender of its session and chat channels.
 */
export class Senders {
  private options: SendersOptions;

  constructor(options: SendersOptions) {
    this.options = options;
  }

  /** Subscribes this router at the sender of the channel and returns the snapshot. */
  async subscribe({ channel, parsed }: ParsedChannel): Promise<SenderSnapshot> {
    const router = this.options.routerName();
    const sender = channelSender(parsed);

    if (parsed.kind === "root") {
      const root = await callDoRpc(
        () => this.options.host(),
        (host) => host.subscribeRoot({ router }),
      );

      return { channel, sender, ...root };
    }

    const session = await callDoRpc(
      () => this.options.session(parsed.sessionId),
      (stub) => stub.subscribe({ router, channel }),
    );

    return { channel, sender, ...session };
  }

  /** Tells the sender to stop its pushes of `channels` to this router. */
  async unsubscribe(sender: string, channels: string[]): Promise<void> {
    const router = this.options.routerName();

    await (sender === ROOT_SENDER
      ? callDoRpc(
          () => this.options.host(),
          (host) => host.unsubscribeRoot({ router }),
        )
      : callDoRpc(
          () => this.options.session(sender),
          (session) => session.unsubscribe({ router, channels }),
        ));
  }
}
