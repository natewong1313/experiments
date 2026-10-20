import { ROOT_CHANNEL } from "../../shared/protocol";
import type {
  RootEvent,
  RouterPushResponse,
  RouterRootUpdateRequest,
  RouterSessionActionsRequest,
  RouterSessionDisposedRequest,
  SessionEnvelope,
} from "../../shared/rpc/router";
import type { AgentHostConnectionRouterDeps } from "../dependencies";
import { HOST_SENDER, sessionSender } from "../sender";
import type { Sender } from "../sender";
import { rootNotification, send } from "../websockets";
import type { ClientConnection } from "./client-connection";
import type { SenderRevision } from "../dependencies/subscription-store";
import type { Subscriptions } from "./subscriptions";

/** A root event as an item of its root revision. */
type RootItem = { channel: string; event: RootEvent };

/** Sends the accepted items of a push to the client. */
type Deliver<Item> = (socket: WebSocket, items: Item[]) => void;

/**
 * Handles the updates that the host and the sessions push to one client connection. It applies
 * each push in revision order, allocates the `serverSeq` of the connection, and forwards the
 * accepted items to the client socket.
 *
 * A router that finds a revision gap closes its WebSocket, because the senders keep no history
 * to fill the gap. Pushes that arrive during a subscription setup are held until the setup ends.
 */
export class SenderRequestsRouter {
  private deps: AgentHostConnectionRouterDeps;
  private connection: ClientConnection;
  private subscriptions: Subscriptions;

  constructor(
    deps: AgentHostConnectionRouterDeps,
    connection: ClientConnection,
    subscriptions: Subscriptions,
  ) {
    this.deps = deps;
    this.connection = connection;
    this.subscriptions = subscriptions;
  }

  /** Forwards session and chat actions to the client. */
  async sessionActions(req: RouterSessionActionsRequest): Promise<RouterPushResponse> {
    const revisions = req.updates.map(({ revision, actions }) => ({ revision, items: actions }));

    return await this.receivePush(
      sessionSender(req.sessionId),
      req.after,
      revisions,
      (socket, envelopes) => {
        this.sendActions(socket, envelopes);
      },
    );
  }

  /** Forwards root actions and root notifications to the client. */
  async rootUpdate(req: RouterRootUpdateRequest): Promise<RouterPushResponse> {
    const revisions = req.updates.map((update) => ({
      revision: update.revision,
      items: [{ channel: ROOT_CHANNEL, event: update }],
    }));

    return await this.receivePush(HOST_SENDER, req.after, revisions, (socket, items) => {
      this.sendRootEvents(socket, items);
    });
  }

  /** Removes the subscriptions of a disposed session without a message to the client. */
  async sessionDisposed(req: RouterSessionDisposedRequest): Promise<void> {
    const sender = sessionSender(req.sessionId);

    const remove = async (): Promise<void> => {
      if (this.connection.isOpen()) {
        this.deps.subscriptionStore.removeSender(sender);
      }
    };

    const held = this.subscriptions.hold(sender, remove);

    if (held === "ready") {
      await remove();
    } else if (held === "full") {
      await this.connection.fail("Missed updates");
    }
  }

  /**
   * Applies a push from a sender, or holds it while a subscription setup includes the sender.
   * Returns the channels of the sender that the client subscribes to, or will subscribe to.
   */
  private async receivePush<Item extends { channel: string }>(
    sender: Sender,
    after: number,
    revisions: SenderRevision<Item>[],
    deliver: Deliver<Item>,
  ): Promise<RouterPushResponse> {
    const apply = async (): Promise<RouterPushResponse> =>
      await this.applyPush(sender, after, revisions, deliver);

    const held = this.subscriptions.hold(sender, async () => {
      await apply();
    });

    switch (held) {
      case "ready": {
        return await apply();
      }

      case "held": {
        return { subscribed: this.subscriptions.channelsOf(sender) };
      }

      case "full": {
        await this.connection.fail("Missed updates");

        return { subscribed: [] };
      }
    }
  }

  /** Applies a push and passes its new items to `deliver`. */
  private async applyPush<Item extends { channel: string }>(
    sender: Sender,
    after: number,
    revisions: SenderRevision<Item>[],
    deliver: Deliver<Item>,
  ): Promise<RouterPushResponse> {
    const socket = await this.connection.socket();

    if (!socket) {
      return { subscribed: [] };
    }

    const receipt = this.deps.subscriptionStore.receive(sender, after, revisions);

    switch (receipt.kind) {
      case "unknown": {
        return { subscribed: [] };
      }

      case "gap": {
        await this.connection.fail("Missed updates");

        return { subscribed: [] };
      }

      case "accepted": {
        deliver(socket, receipt.items);

        return { subscribed: receipt.subscribed };
      }
    }
  }

  /** Sends root actions with consecutive `serverSeq` values, and root notifications without. */
  private sendRootEvents(socket: WebSocket, items: RootItem[]): void {
    const actions = items.filter((item) => item.event.kind === "action").length;
    // A push of only notifications uses no `serverSeq`, so the router skips the write.
    let [serverSeq] = actions > 0 ? this.deps.sequence.increment(actions) : [0];

    for (const { channel, event } of items) {
      if (event.kind === "action") {
        send(socket, {
          jsonrpc: "2.0",
          method: "action",
          params: { channel, action: event.action, serverSeq },
        });
        serverSeq += 1;
      } else {
        send(socket, rootNotification(channel, event));
      }
    }
  }

  /** Sends session and chat actions with consecutive `serverSeq` values. */
  private sendActions(socket: WebSocket, envelopes: SessionEnvelope[]): void {
    if (envelopes.length === 0) {
      return;
    }

    const [firstSeq] = this.deps.sequence.increment(envelopes.length);

    for (const [index, envelope] of envelopes.entries()) {
      const params = { ...envelope, serverSeq: firstSeq + index };
      send(socket, { jsonrpc: "2.0", method: "action", params });
    }
  }
}
