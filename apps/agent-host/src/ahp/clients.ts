import * as z from "zod";
import {
  ROOT,
  MAX_SUBSCRIPTIONS,
  MAX_ATTACHMENT_BYTES,
  FAILED_CONNECTION_CLOSE,
  VERSION_REJECT_CLOSE,
  STATUS_UPGRADE_REQUIRED,
  ConnectionSchema,
  ProtocolError,
  RpcCodes,
  type Connection,
} from "./protocol";
import type { Publication } from "../state/store";

const STATUS_SWITCHING_PROTOCOLS = 101;
const NO_CLOSE_STATUS = 1005;
const ABNORMAL_CLOSE = 1006;
const NORMAL_CLOSE = 1000;
const AttachmentLimitSchema = z.array(z.string()).max(MAX_SUBSCRIPTIONS);

class AhpClients {
  private readonly ctx: Pick<
    DurableObjectState,
    "acceptWebSocket" | "getWebSockets"
  >;

  constructor({
    ctx,
  }: {
    ctx: Pick<DurableObjectState, "acceptWebSocket" | "getWebSockets">;
  }) {
    this.ctx = ctx;
  }

  upgrade(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", {
        status: STATUS_UPGRADE_REQUIRED,
      });
    }
    const { 0: clientSocket, 1: serverSocket } = new WebSocketPair();
    this.ctx.acceptWebSocket(serverSocket);
    serverSocket.serializeAttachment({ phase: "new" });
    return new Response(null, {
      status: STATUS_SWITCHING_PROTOCOLS,
      webSocket: clientSocket,
    });
  }

  close(socket: WebSocket, code: number, reason: string): void {
    socket.close(
      code === NO_CLOSE_STATUS || code === ABNORMAL_CLOSE ? NORMAL_CLOSE : code,
      reason,
    );
  }

  error(socket: WebSocket): void {
    socket.close(FAILED_CONNECTION_CLOSE, "Client connection failed");
  }

  connection(socket: WebSocket): Connection {
    return ConnectionSchema.parse(socket.deserializeAttachment());
  }

  send(socket: WebSocket, message: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify(message));
    } catch {
      socket.close(FAILED_CONNECTION_CLOSE, "Client delivery failed");
    }
  }

  notify(channel: string, method: string, params: object): void {
    for (const socket of this.ctx.getWebSockets()) {
      const client = this.connection(socket);
      if (client.phase === "ready" && client.subscriptions.includes(channel)) {
        this.send(socket, {
          jsonrpc: "2.0",
          method,
          params: { channel, ...params },
        });
      }
    }
  }

  broadcast(publication: Publication): void {
    for (const envelope of publication.actions) {
      this.notify(envelope.channel, "action", envelope);
    }
    if (publication.summary) {
      const { summary } = publication;
      const { resource, ...changes } = summary;
      this.notify(ROOT, "root/sessionSummaryChanged", {
        session: resource,
        changes,
      });
    }
  }

  attach(socket: WebSocket, clientId: string, subscriptions: string[]): void {
    const unique = AttachmentLimitSchema.parse([...new Set(subscriptions)]);
    const attachment = { phase: "ready", clientId, subscriptions: unique };
    if (
      new TextEncoder().encode(JSON.stringify(attachment)).byteLength >
      MAX_ATTACHMENT_BYTES
    ) {
      throw new ProtocolError(
        RpcCodes.params,
        "Subscriptions exceed the connection storage limit",
      );
    }
    for (const existing of this.ctx.getWebSockets()) {
      const client = this.connection(existing);
      if (
        existing !== socket &&
        client.phase === "ready" &&
        client.clientId === clientId
      ) {
        existing.close(VERSION_REJECT_CLOSE, "Client reconnected elsewhere");
      }
    }
    socket.serializeAttachment(attachment);
  }

  unsubscribe(socket: WebSocket, channel: string): void {
    const client = this.connection(socket);
    if (client.phase === "ready") {
      socket.serializeAttachment({
        ...client,
        subscriptions: client.subscriptions.filter((uri) => uri !== channel),
      });
    }
  }

  dropChannels(channels: string[]): void {
    for (const socket of this.ctx.getWebSockets()) {
      const client = this.connection(socket);
      if (client.phase === "ready") {
        socket.serializeAttachment({
          ...client,
          subscriptions: client.subscriptions.filter(
            (uri) => !channels.includes(uri),
          ),
        });
      }
    }
  }
}

export { AhpClients };
