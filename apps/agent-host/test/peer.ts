import { PROTOCOL_VERSION as AHP_PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import {
  ActionEnvelopeSchema,
  JsonRpcNotificationSchema,
  JsonRpcReplySchema,
  type ActionEnvelope,
  type JsonRpcNotification,
  type JsonRpcReply,
  type JsonValue,
  type ChannelParams,
  type CreateSessionParams,
  type DispatchActionParams,
  type FetchTurnsParams,
  type InitializeParams,
  type ListSessionsParams,
  type ReconnectParams,
  type RootChannelParams,
  type ResourceReadParams,
  type SubscribeParams,
} from "@experiments/protocol-schemas/ahp";
import * as z from "zod";
import { onTestFinished, vi } from "vitest";
import worker from "./worker";
import { env } from "cloudflare:workers";

const MessageSchema = z.union([JsonRpcNotificationSchema, JsonRpcReplySchema]);
const JsonValueSchema = z.json();
const PeerObjectResultSchema = z.object({}).catchall(JsonValueSchema);
const PeerResultSchema = z.union([PeerObjectResultSchema, z.null()]);

type PeerParams =
  | ChannelParams
  | CreateSessionParams
  | DispatchActionParams
  | FetchTurnsParams
  | InitializeParams
  | ListSessionsParams
  | ReconnectParams
  | RootChannelParams
  | ResourceReadParams
  | SubscribeParams;

export class Peer {
  readonly messages: z.output<typeof MessageSchema>[] = [];
  readonly actions: ActionEnvelope[] = [];
  readonly notifications: JsonRpcNotification[] = [];
  private readonly replies: JsonRpcReply[] = [];
  private readonly socket: WebSocket;
  private nextId = 0;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const text = z.string().parse(event.data);
      const value: unknown = JSON.parse(text);
      const message = MessageSchema.parse(value);
      this.messages.push(message);

      if ("method" in message) {
        if (message.method === "action") {
          this.actions.push(ActionEnvelopeSchema.parse(message.params));
        } else {
          this.notifications.push(message);
        }
      } else {
        this.replies.push(message);
      }
    });
    socket.accept();
  }

  async request(method: string, params: PeerParams): Promise<z.output<typeof PeerResultSchema>> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));

    const reply = await vi.waitFor(() => {
      const received = this.replies.find((message) => message.id === id);

      if (!received) {
        throw new Error(`Waiting for ${method}`);
      }

      return received;
    });

    if ("error" in reply) {
      throw new Error(reply.error.message);
    }

    return PeerResultSchema.parse(reply.result);
  }

  notify(method: string, params: PeerParams): void {
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  notifyRaw(method: string, params: JsonValue): void {
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  close(): void {
    this.socket.close();
  }
}

export async function openPeer(hostId: string): Promise<Peer> {
  const response = await worker.fetch(
    new Request(`https://host/hosts/${hostId}/ahp`, {
      headers: { Upgrade: "websocket" },
    }),
    env,
  );

  if (!response.webSocket) {
    throw new Error("Host did not accept the WebSocket upgrade");
  }

  const peer = new Peer(response.webSocket);
  onTestFinished(() => {
    peer.close();
  });

  return peer;
}

export async function connectPeer(hostId: string, clientId = crypto.randomUUID()): Promise<Peer> {
  const peer = await openPeer(hostId);
  await peer.request("initialize", {
    channel: "ahp-root://",
    clientId,
    protocolVersions: [AHP_PROTOCOL_VERSION],
  });

  return peer;
}
