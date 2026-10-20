import { parseChannel } from "../../shared/lookups";
import { AHPError } from "../../shared/protocol";
import { toAHPError } from "../../shared/rpc/errors";
import type { AgentHostConnectionRouterDeps } from "../dependencies";
import type { SenderSnapshot } from "../dependencies/remote-subscriptions";
import { channelSender, groupBySender, isSameSender } from "../sender";
import type { ChannelSender, Sender, SenderChannels } from "../sender";
import type { Frame } from "./client-connection";

/** The maximum number of pushes that one subscription setup holds. */
export const MAX_HELD_PUSHES = 1024;

/** A push that waits until the subscription setup ends. */
export type HeldPush = () => Promise<void>;

/**
 * The result of `hold`. `ready` means that no setup includes the sender, so the caller applies
 * the push now. `full` means that the setup already holds `MAX_HELD_PUSHES` pushes.
 */
export type HoldResult = "ready" | "held" | "full";

/** The subscriptions of a setup that has not finished, and the pushes that wait for it. */
type Setup = { subscriptions: ChannelSender[]; pushes: HeldPush[] };

/**
 * Runs the subscriptions of one client connection. It requests the channel snapshots from the
 * senders and stores the subscriptions.
 *
 * A subscription setup lasts from `subscribe` to `finishFrame`. During the setup, the router
 * acknowledges pushes from the senders of the setup and holds them in memory. The router applies
 * held pushes after it sends the reply with the snapshots. Thus each snapshot revision filters
 * the held pushes, and the client receives each snapshot first.
 */
export class Subscriptions {
  private deps: AgentHostConnectionRouterDeps;
  private setup?: Setup;

  constructor(deps: AgentHostConnectionRouterDeps) {
    this.deps = deps;
  }

  /**
   * Subscribes the client to the channels and returns their snapshots. The pushes from the
   * senders of the channels wait until `finishFrame`.
   *
   * The router stores the subscriptions only if every sender accepts and the frame is still
   * current. Otherwise it tells each sender that accepted a new subscription to stop.
   *
   * @throws {AHPError} If a channel is not valid, a sender fails, or the connection closed.
   */
  async subscribe(channels: string[], frame: Frame): Promise<SenderSnapshot[]> {
    const { remoteSubscriptions, subscriptionStore } = this.deps;

    // An invalid channel throws here, before the setup starts.
    const subscriptions = channels.map((channel) => ({
      channel,
      sender: channelSender(parseChannel(channel)),
    }));

    this.startSetup(subscriptions);

    const results = await Promise.allSettled(
      subscriptions.map(
        async ({ channel, sender }) => await remoteSubscriptions.subscribe(sender, channel),
      ),
    );

    const snapshots = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const failure = results.find((result) => result.status === "rejected");
    const open = frame.isCurrent();

    if (failure || !open) {
      // Subscriptions from earlier requests stay while the connection is open.
      // After a close, the router has no storage. Thus each accepted subscription must stop.
      const subscriptionsToUndo = open
        ? snapshots.filter((item) => !subscriptionStore.isSubscribed(item.channel))
        : snapshots;

      await remoteSubscriptions.unsubscribeAll(groupBySender(subscriptionsToUndo));

      throw failure ? toAHPError(failure.reason) : new AHPError("Connection is closed");
    }

    for (const { channel, sender, revision } of snapshots) {
      subscriptionStore.store({ channel, sender, revision });
    }

    return snapshots;
  }

  /** Removes a subscription here, then at its sender. */
  async unsubscribe(channel: string): Promise<void> {
    const sender = this.deps.subscriptionStore.remove(channel);

    if (sender !== undefined) {
      await this.deps.remoteSubscriptions.unsubscribe(sender, [channel]);
    }
  }

  /**
   * Ends the subscription setup of a frame. Runs the held pushes in arrival order, including
   * pushes that arrive during the run. Then records that the setup ended. If a push throws, the
   * record remains until the connection closes.
   */
  async finishFrame(): Promise<void> {
    const { setup } = this;

    if (!setup) {
      return;
    }

    try {
      for (let push = setup.pushes.shift(); push; push = setup.pushes.shift()) {
        if (this.setup !== setup) {
          return;
        }

        // Pushes from one sender must keep their arrival order.
        // oxlint-disable-next-line eslint/no-await-in-loop
        await push();
      }

      if (this.setup === setup) {
        this.deps.subscriptionStore.endSetup();
      }
    } finally {
      if (this.setup === setup) {
        this.setup = undefined;
      }
    }
  }

  /**
   * Holds a push while a subscription setup includes its sender. Returns `ready` if no setup
   * includes the sender. The caller then applies the push itself.
   */
  hold(sender: Sender, push: HeldPush): HoldResult {
    const { setup } = this;

    if (!setup || !setup.subscriptions.some((item) => isSameSender(item.sender, sender))) {
      return "ready";
    }

    if (setup.pushes.length >= MAX_HELD_PUSHES) {
      return "full";
    }

    setup.pushes.push(push);

    return "held";
  }

  /** Returns the channels of a sender, including the channels of the current setup. */
  channelsOf(sender: Sender): string[] {
    const pending = (this.setup?.subscriptions ?? [])
      .filter((item) => isSameSender(item.sender, sender))
      .map((item) => item.channel);

    return [...new Set([...this.deps.subscriptionStore.channelsOf(sender), ...pending])];
  }

  /**
   * Discards the current setup and its held pushes. Returns the channels of each sender,
   * including the channels of the discarded setup. The connection calls this when it closes.
   */
  release(): SenderChannels {
    const pending = this.setup?.subscriptions ?? [];
    this.setup = undefined;

    return groupBySender([...this.deps.subscriptionStore.subscriptions(), ...pending]);
  }

  /** Records the setup and holds pushes from its senders until `finishFrame`. */
  private startSetup(subscriptions: ChannelSender[]): void {
    // A setup without subscriptions holds no pushes.
    if (subscriptions.length === 0) {
      return;
    }

    this.deps.subscriptionStore.startSetup();
    this.setup = { subscriptions, pushes: [] };
  }
}
