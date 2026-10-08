import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import {
  ActionEnvelopeSchema,
  JsonRpcNotificationSchema,
  JsonRpcReplySchema,
  type ActionEnvelope,
  type JsonRpcReply,
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
import { vi } from "vitest";

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
  readonly actions: ActionEnvelope[] = [];
  private readonly replies: JsonRpcReply[] = [];
  private readonly socket: WebSocket;
  private nextId = 0;

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const text = z.string().parse(event.data);
      const value: unknown = JSON.parse(text);
      const message = MessageSchema.parse(value);

      if ("method" in message) {
        if (message.method === "action") {
          this.actions.push(ActionEnvelopeSchema.parse(message.params));
        }
      } else {
        this.replies.push(message);
      }
    });
    socket.accept();
  }

  async request(method: string, params: PeerParams): Promise<object | null> {
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

  close(): void {
    this.socket.close();
  }
}

export async function connectPeer(
  stub: DurableObjectStub,
  clientId = "test-client",
): Promise<Peer> {
  const response = await stub.fetch("https://host/ahp", {
    headers: { Upgrade: "websocket" },
  });

  if (!response.webSocket) {
    throw new Error("Host did not accept the WebSocket upgrade");
  }

  const peer = new Peer(response.webSocket);
  await peer.request("initialize", {
    channel: "ahp-root://",
    clientId,
    protocolVersions: [PROTOCOL_VERSION],
  });

  return peer;
}
