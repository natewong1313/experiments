import * as z from "zod";
import type { Snapshot as AHPSnapshot } from "@experiments/protocol-schemas/ahp";
import type { JsonRpcMessage } from "../../protocol";
import { send } from "../websockets";

/**
 * Subscriptions map each channel to the revision of the snapshot the socket received. The root
 * channel counts host server sequences, whereas session and chat channels count their session's revision.
 * Revisions reach the host in order per channel, meaning that you can tell a message is new when its
 * revision > the snapshots.
 */
const AttachmentSchema = z.object({
  clientId: z.string().optional(),
  subscriptions: z.record(z.string(), z.number()),
});

type Attachment = z.output<typeof AttachmentSchema>;

/**
 * A message for a channel's subscribers. Actions carry the revision they produce so that sockets
 * whose snapshot already includes them skip them; notifications have no revision.
 */
export type ChannelMessageDetails = { channel: string; message: JsonRpcMessage; revision?: number };

export type ChannelSnapshot = { snapshot: AHPSnapshot; revision: number };

type SnapshotLoader = (channel: string) => Promise<ChannelSnapshot>;

// Channels a socket is subscribing to, and the messages buffered for them in arrival order.
type PendingSubscription = { channels: Set<string>; messages: ChannelMessageDetails[] };

/**
 * Owns a hosts websocket clients.
 * Tracks what each websocket is subscribed to and ensures we deliver messages to the right socket.
 */
export class ConnectionsService {
  private ctx: DurableObjectState;
  private attachments: WeakMap<WebSocket, Attachment> = new WeakMap();
  private pendingSubscriptions: WeakMap<WebSocket, PendingSubscription> = new WeakMap();
  private messageQueues: WeakMap<WebSocket, Promise<void>> = new WeakMap();

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  /**
   * Accepts a hibernatable socket with no client ID and no subscriptions.
   */
  accept(socket: WebSocket): void {
    this.ctx.acceptWebSocket(socket);
    this.save(socket, { subscriptions: {} });
  }

  /**
   * Runs `task` after every earlier task for the same socket has settled, then delivers what
   * `subscribe` buffered during it.
   */
  async serialize(socket: WebSocket, task: () => Promise<void>): Promise<void> {
    const previous = this.messageQueues.get(socket) ?? Promise.resolve();

    const next = (async (): Promise<void> => {
      await Promise.allSettled([previous]);

      try {
        await task();
      } finally {
        this.completeSubscription(socket);
      }
    })();

    this.messageQueues.set(socket, next);
    await next;
  }

  /**
   * Returns the client ID set by the `initialize` function, or undefined before initialization.
   */
  clientId(socket: WebSocket): string | undefined {
    return this.attachment(socket).clientId;
  }

  /**
   * Saves the client ID which marks the connection as initialized.
   */
  initialize(socket: WebSocket, clientId: string): void {
    this.save(socket, { ...this.attachment(socket), clientId });
  }

  /**
   * Loads a snapshot for each channel and subscribes the socket at the snapshots' revisions.
   * Must run inside `serialize`, at most once per task: messages on these channels are
   * buffered until the task settles.
   */
  async subscribe(
    socket: WebSocket,
    channels: string[],
    load: SnapshotLoader,
  ): Promise<AHPSnapshot[]> {
    this.pendingSubscriptions.set(socket, { channels: new Set(channels), messages: [] });
    const loaded = await Promise.all(channels.map(async (channel) => await load(channel)));
    const attachment = this.attachment(socket);

    for (const { snapshot, revision } of loaded) {
      attachment.subscriptions[snapshot.resource] = revision;
    }

    this.save(socket, attachment);

    return loaded.map((item) => item.snapshot);
  }

  /**
   * Stops messages on `channel` to the websocket if the socket has active subscriptions.
   */
  unsubscribe(socket: WebSocket, channel: string): void {
    const attachment = this.attachment(socket);

    if (attachment.subscriptions[channel] !== undefined) {
      delete attachment.subscriptions[channel];
      this.save(socket, attachment);
    }
  }

  /**
   * Unsubscribes every socket from `channel`, for example after its session is disposed.
   */
  removeChannel(channel: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      this.unsubscribe(socket, channel);
    }
  }

  /**
   * Sends `messageDetails` to every socket subscribed to its channel, skipping actions a socket's
   * snapshot already includes. Sockets still subscribing to the channel receive it once their
   * reply is sent.
   */
  publish(messageDetails: ChannelMessageDetails): void {
    for (const socket of this.ctx.getWebSockets()) {
      const pending = this.pendingSubscriptions.get(socket);

      if (pending !== undefined && pending.channels.has(messageDetails.channel)) {
        pending.messages.push(messageDetails);
      } else {
        this.deliverMessage(socket, messageDetails);
      }
    }
  }

  private completeSubscription(socket: WebSocket): void {
    const pending = this.pendingSubscriptions.get(socket);
    this.pendingSubscriptions.delete(socket);

    for (const messageDetails of pending?.messages ?? []) {
      this.deliverMessage(socket, messageDetails);
    }
  }

  private deliverMessage(socket: WebSocket, messageDetails: ChannelMessageDetails): void {
    const snapshotRevision = this.attachment(socket).subscriptions[messageDetails.channel];

    if (snapshotRevision === undefined) {
      return;
    }

    if (messageDetails.revision === undefined || messageDetails.revision > snapshotRevision) {
      send(socket, messageDetails.message);
    }
  }

  private attachment(socket: WebSocket): Attachment {
    const cached = this.attachments.get(socket);

    if (cached) {
      return cached;
    }

    const attachment = AttachmentSchema.parse(socket.deserializeAttachment());
    this.attachments.set(socket, attachment);

    return attachment;
  }

  private save(socket: WebSocket, attachment: Attachment): void {
    this.attachments.set(socket, attachment);
    socket.serializeAttachment(attachment);
  }
}
