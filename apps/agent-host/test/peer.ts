import { PROTOCOL_VERSION as AHP_PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import {
  ActionEnvelopeSchema,
  SessionStateSchema,
  SubscribeResultSchema,
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
  readonly closed: Promise<number>;
  private readonly replies: JsonRpcReply[] = [];
  private readonly socket: WebSocket;
  private nextId = 0;

  constructor(socket: WebSocket) {
    this.socket = socket;
    const closed = Promise.withResolvers<number>();
    this.closed = closed.promise;
    socket.addEventListener("close", (event) => {
      closed.resolve(event.code);
    });
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

function accept(response: Response): Peer {
  if (!response.webSocket) {
    throw new Error("Router did not accept the WebSocket upgrade");
  }

  const peer = new Peer(response.webSocket);
  onTestFinished(() => {
    peer.close();
  });

  return peer;
}

function upgrade(url: string): Request {
  return new Request(url, { headers: { Upgrade: "websocket" } });
}

export async function openPeer(hostId: string): Promise<Peer> {
  const request = upgrade(`https://host/hosts/${hostId}/ahp`);

  return accept(await worker.fetch(request, env));
}

/** Opens a connection through a router with a known name, so tests can inspect the router. */
export async function openPeerAt(router: string): Promise<Peer> {
  const stub = env.CONNECTIONS.getByName(router);
  const request = upgrade("https://host/");

  return accept(await stub.fetch(request));
}

export async function initialize(peer: Peer, clientId = crypto.randomUUID()): Promise<Peer> {
  await peer.request("initialize", {
    channel: "ahp-root://",
    clientId,
    protocolVersions: [AHP_PROTOCOL_VERSION],
  });

  return peer;
}

export async function connectPeer(hostId: string, clientId = crypto.randomUUID()): Promise<Peer> {
  return await initialize(await openPeer(hostId), clientId);
}

export async function connectPeerAt(router: string): Promise<Peer> {
  return await initialize(await openPeerAt(router));
}

export type CreatedSession = { sessionId: string; channel: string; chat: string };

/** Creates a session, subscribes the peer to its session channel, and returns its chat. */
export async function createSession(peer: Peer): Promise<CreatedSession> {
  const sessionId = crypto.randomUUID();
  const channel = `ahp-session:/${sessionId}`;
  await peer.request("createSession", { channel, provider: "test" });
  const subscribed = SubscribeResultSchema.parse(await peer.request("subscribe", { channel }));
  const state = SessionStateSchema.parse(subscribed.snapshot?.state);

  if (state.defaultChat === undefined) {
    throw new Error("Session has no default chat");
  }

  return { sessionId, channel, chat: state.defaultChat };
}
