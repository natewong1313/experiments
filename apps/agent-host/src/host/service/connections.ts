import * as z from "zod";
import type { JsonRpcMessage } from "../../protocol";
import { send } from "../../protocol";
import type { ActionEnvelope, Snapshot } from "@experiments/protocol-schemas/ahp";

/**
 * Subscriptions map each channel to the last revision the socket has seen. The root channel
 * counts host server sequences; session and chat channels count their session's revision.
 */
const AttachmentSchema = z.object({
  clientId: z.string().optional(),
  subscriptions: z.record(z.string(), z.number()),
});

type Attachment = z.output<typeof AttachmentSchema>;

export type DeliveredAction = { envelope: ActionEnvelope; revision: number };

export type ChannelSnapshot = { snapshot: Snapshot; revision: number };

type SubscribeOptions = {
  socket: WebSocket;
  channels: string[];
  load(channel: string): Promise<ChannelSnapshot>;
  respond(snapshots: Snapshot[]): void;
};

export class ConnectionsService {
  private ctx: DurableObjectState;
  // Socket attachments survive hibernation; this caches them so deliveries skip re-parsing.
  private attachments: WeakMap<WebSocket, Attachment> = new WeakMap();
  // Actions broadcast while a socket's snapshots load, held per channel until the response is sent.
  private held: WeakMap<WebSocket, Map<string, DeliveredAction[]>> = new WeakMap();
  private queues: WeakMap<WebSocket, Promise<void>> = new WeakMap();

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  accept(socket: WebSocket): void {
    this.ctx.acceptWebSocket(socket);
    this.save(socket, { subscriptions: {} });
  }

  /** Runs `task` after every earlier task for the same socket has settled. */
  async serialize(socket: WebSocket, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(socket) ?? Promise.resolve();

    const next = (async (): Promise<void> => {
      // An earlier task's failure belongs to its own caller.
      await Promise.allSettled([previous]);
      await task();
    })();

    this.queues.set(socket, next);
    await next;
  }

  clientId(socket: WebSocket): string | undefined {
    return this.attachment(socket).clientId;
  }

  initialize(socket: WebSocket, clientId: string): void {
    this.save(socket, { ...this.attachment(socket), clientId });
  }

  /**
   * Loads a snapshot for each channel and subscribes the socket to them.
   * Actions broadcast while loading are held and delivered after `respond` sends the snapshots.
   * Calls for one socket must not overlap; `serialize` guarantees this for message handlers.
   */
  async subscribe(options: SubscribeOptions): Promise<void> {
    const { socket, channels } = options;
    const held = new Map(channels.map((channel): [string, DeliveredAction[]] => [channel, []]));
    this.held.set(socket, held);

    try {
      const loaded = await Promise.all(channels.map((channel) => options.load(channel)));
      options.respond(loaded.map((item) => item.snapshot));
      const attachment = this.attachment(socket);

      for (const { snapshot, revision } of loaded) {
        attachment.subscriptions[snapshot.resource] = revision;
      }

      this.save(socket, attachment);

      for (const action of [...held.values()].flat()) {
        this.deliver(socket, action);
      }
    } finally {
      this.held.delete(socket);
    }
  }

  unsubscribe(socket: WebSocket, channel: string): void {
    const attachment = this.attachment(socket);
    delete attachment.subscriptions[channel];
    this.save(socket, attachment);
  }

  removeChannel(channel: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      this.unsubscribe(socket, channel);
    }
  }

  broadcast(action: DeliveredAction): void {
    for (const socket of this.ctx.getWebSockets()) {
      const held = this.held.get(socket)?.get(action.envelope.channel);

      if (held) {
        held.push(action);
      } else {
        this.deliver(socket, action);
      }
    }
  }

  notify(channel: string, message: JsonRpcMessage): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (this.attachment(socket).subscriptions[channel] !== undefined) {
        send(socket, message);
      }
    }
  }

  private deliver(socket: WebSocket, action: DeliveredAction): void {
    const attachment = this.attachment(socket);
    const { channel } = action.envelope;
    const seen = attachment.subscriptions[channel];

    if (seen === undefined || action.revision <= seen) {
      return;
    }

    send(socket, { jsonrpc: "2.0", method: "action", params: action.envelope });
    attachment.subscriptions[channel] = action.revision;
    this.save(socket, attachment);
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
