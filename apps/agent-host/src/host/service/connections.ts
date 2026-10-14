import * as z from "zod";
import type { JsonRpcMessage } from "../../protocol";
import { send } from "../../protocol";
import type { ActionEnvelope as AHPActionEnvelope } from "@experiments/protocol-schemas/ahp";

const AttachmentSchema = z.object({
  clientId: z.string().optional(),
  subscriptions: z.record(z.string(), z.number()),
});

type ConnectionAttachment = z.output<typeof AttachmentSchema>;

type DeliveredAction = { envelope: AHPActionEnvelope; revision: number };

type PendingSubscription = { channel: string; actions: DeliveredAction[] };

export class ConnectionsService {
  private ctx: DurableObjectState;
  private pending: Map<WebSocket, Map<string, PendingSubscription>> = new Map();

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  attachment(socket: WebSocket): ConnectionAttachment {
    return AttachmentSchema.parse(socket.deserializeAttachment());
  }

  initialize(socket: WebSocket, clientId: string): void {
    socket.serializeAttachment({ clientId, subscriptions: {} });
  }

  begin(socket: WebSocket, channel: string): void {
    const channels = this.pending.get(socket) ?? new Map<string, PendingSubscription>();
    channels.set(channel, { channel, actions: [] });
    this.pending.set(socket, channels);
  }

  finish(socket: WebSocket, channel: string, revision: number): void {
    const attachment = this.attachment(socket);
    attachment.subscriptions[channel] = revision;
    socket.serializeAttachment(attachment);
    const pending = this.pending.get(socket)?.get(channel);
    this.pending.get(socket)?.delete(channel);

    if (pending) {
      for (const action of pending.actions) {
        this.deliver(socket, action);
      }
    }
  }

  cancel(socket: WebSocket): void {
    this.pending.delete(socket);
  }

  unsubscribe(socket: WebSocket, channel: string): void {
    const attachment = this.attachment(socket);
    delete attachment.subscriptions[channel];
    socket.serializeAttachment(attachment);
  }

  removeChannel(channel: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      this.unsubscribe(socket, channel);
    }
  }

  broadcast(action: DeliveredAction): void {
    for (const socket of this.ctx.getWebSockets()) {
      const pending = this.pending.get(socket)?.get(action.envelope.channel);

      if (pending) {
        pending.actions.push(action);
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
    const revision = attachment.subscriptions[action.envelope.channel];

    if (revision !== undefined && action.revision > revision) {
      send(socket, { jsonrpc: "2.0", method: "action", params: action.envelope });
      attachment.subscriptions[action.envelope.channel] = action.revision;
      socket.serializeAttachment(attachment);
    }
  }
}
