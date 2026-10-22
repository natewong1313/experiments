import { parseChannel } from "../../shared/lookups";
import { AHPError, isNotFound } from "../../shared/protocol";
import { toAHPError } from "../../shared/rpc/errors";
import type { AgentHostConnectionRouterDeps } from "../dependencies";
import type { SenderSnapshot } from "../dependencies/remote-subscriptions";
import { channelSender, groupBySender, isSameSender } from "../sender";
import type { ChannelSender, Sender, SenderChannels } from "../sender";
import type { Frame } from "./client-connection";
import type { SubscribeView as AHPSubscribeView } from "@experiments/protocol-schemas/ahp";

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
 * `view` sets the loaded history of each chat. If `skipsMissing` is true, a channel that its
 * sender reports as not found gets no snapshot and does not fail the setup.
 */
type SetupOptions = { view?: AHPSubscribeView; skipsMissing: boolean };

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
  // The `subscribe` and `recover` calls that run now.
  private running = 0;

  constructor(deps: AgentHostConnectionRouterDeps) {
    this.deps = deps;
  }

  /**
   * Subscribes the client to the channels and returns their snapshots. `view` sets the loaded
   * history of each chat. The pushes from the senders of the channels wait until `finishFrame`.
   *
   * The router stores the subscriptions only if every sender accepts and the frame is still
   * current. Otherwise it tells each sender that accepted a new subscription to stop. After a
   * close, it registers a durable call for this.
   *
   * @throws {AHPError} If a channel is not valid, a sender fails, or the connection closed.
   */
  async subscribe(
    channels: string[],
    frame: Frame,
    view?: AHPSubscribeView,
  ): Promise<SenderSnapshot[]> {
    return await this.run(channels, frame, { view, skipsMissing: false });
  }

  /**
   * Subscribes the client to the channels of a reconnect and returns their snapshots. Unlike
   * `subscribe`, it omits each channel that its sender reports as not found. Any other failure
   * rejects the whole recovery.
   *
   * @throws {AHPError} If a channel is not valid, a sender fails, or the connection closed.
   */
  async recover(channels: string[], frame: Frame): Promise<SenderSnapshot[]> {
    return await this.run(channels, frame, { skipsMissing: true });
  }

  /**
   * True while a `subscribe` or `recover` call runs. A call that started before a close can
   * still register a durable call, so the router keeps its storage until the call ends.
   */
  isSubscribing(): boolean {
    return this.running > 0;
  }

  /** Subscribes once to each distinct channel. */
  private async run(
    channels: string[],
    frame: Frame,
    options: SetupOptions,
  ): Promise<SenderSnapshot[]> {
    // An invalid channel throws here, before the setup starts.
    const subscriptions = [...new Set(channels)].map((channel) => ({
      channel,
      sender: channelSender(parseChannel(channel)),
    }));

    this.running += 1;

    try {
      return await this.subscribeAtSenders(subscriptions, frame, options);
    } finally {
      this.running -= 1;
    }
  }

  /** Starts the setup, subscribes at the senders, and stores the subscriptions. */
  private async subscribeAtSenders(
    subscriptions: ChannelSender[],
    frame: Frame,
    { view, skipsMissing }: SetupOptions,
  ): Promise<SenderSnapshot[]> {
    const { remoteSubscriptions, subscriptionStore } = this.deps;
    this.startSetup(subscriptions);

    const results = await Promise.allSettled(
      subscriptions.map(
        async ({ channel, sender }) =>
          await remoteSubscriptions.subscribe({ sender, channel, view }, () => frame.isCurrent()),
      ),
    );

    const snapshots = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const failure = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .find((result) => !(skipsMissing && isNotFound(toAHPError(result.reason))));

    const open = frame.isCurrent();

    if (!open) {
      // The initial close can reach a sender before its subscribe request.
      if (snapshots.length > 0) {
        await this.deps.durability.registerLateClose(groupBySender(snapshots));
      }

      throw new AHPError("Connection is closed");
    }

    if (failure) {
      // Subscriptions from earlier requests stay while the connection is open.
      const subscriptionsToUndo = snapshots.filter(
        (item) => !subscriptionStore.isSubscribed(item.channel),
      );

      await remoteSubscriptions.unsubscribeAll(groupBySender(subscriptionsToUndo));

      throw toAHPError(failure.reason);
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
   * including the channels of a setup that did not end. The connection calls this when it
   * closes. The setup can be from before a restart, so its channels come from storage.
   */
  release(): SenderChannels {
    const { subscriptionStore } = this.deps;
    this.setup = undefined;

    return groupBySender([
      ...subscriptionStore.subscriptions(),
      ...subscriptionStore.pendingSubscriptions(),
    ]);
  }

  /** Records the setup and holds pushes from its senders until `finishFrame`. */
  private startSetup(subscriptions: ChannelSender[]): void {
    // A setup without subscriptions holds no pushes.
    if (subscriptions.length === 0) {
      return;
    }

    this.deps.subscriptionStore.startSetup(subscriptions);
    this.setup = { subscriptions, pushes: [] };
  }
}
