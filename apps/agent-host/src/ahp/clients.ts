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
import type { ActionEnvelope, SessionSummary } from "@experiments/protocol-schemas/ahp";
import type { Publication } from "../state";
import { MAX_SNAPSHOT_BYTES, RESPONSE_RESERVE_BYTES, checkBytes } from "../memory";

const STATUS_SWITCHING_PROTOCOLS = 101;

const NO_CLOSE_STATUS = 1005;

const ABNORMAL_CLOSE = 1006;

const NORMAL_CLOSE = 1000;

const AttachmentLimitSchema = z.array(z.string()).max(MAX_SUBSCRIPTIONS);

type ServerFrame =
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      result: object | null;
    }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string; data?: JsonErrorData };
    }
  | { jsonrpc: "2.0"; method: string; params: object };

type JsonErrorData = JsonValue | object;

type NotificationParams =
  | ActionEnvelope
  | { summary: SessionSummary | undefined }
  | { session: string }
  | { session: string; changes: Omit<SessionSummary, "resource"> };

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

type JsonObject = { [key: string]: JsonValue };

type AhpClientsParams = {
  ctx: Pick<DurableObjectState, "acceptWebSocket" | "getWebSockets">;
};

export class AhpClients {
  private readonly ctx: Pick<DurableObjectState, "acceptWebSocket" | "getWebSockets">;

  constructor({ ctx }: AhpClientsParams) {
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
    socket.close(code === NO_CLOSE_STATUS || code === ABNORMAL_CLOSE ? NORMAL_CLOSE : code, reason);
  }

  error(socket: WebSocket): void {
    socket.close(FAILED_CONNECTION_CLOSE, "Client connection failed");
  }

  connection(socket: WebSocket): Connection {
    return ConnectionSchema.parse(socket.deserializeAttachment());
  }

  send(socket: WebSocket, message: ServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) {
      this.sendText(socket, this.serialize(message));
    }
  }

  sendAction(socket: WebSocket, envelope: ActionEnvelope): void {
    const client = this.connection(socket);

    if (client.phase === "ready" && client.subscriptions.includes(envelope.channel)) {
      this.send(socket, { jsonrpc: "2.0", method: "action", params: envelope });
    }
  }

  private serialize(message: ServerFrame): string {
    const text = JSON.stringify(message);
    const limit = MAX_SNAPSHOT_BYTES + RESPONSE_RESERVE_BYTES;
    checkBytes(text.length, limit, "Response exceeds the memory budget");
    checkBytes(
      new TextEncoder().encode(text).byteLength,
      limit,
      "Response exceeds the memory budget",
    );

    return text;
  }

  private sendText(socket: WebSocket, text: string): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send(text);
    } catch {
      socket.close(FAILED_CONNECTION_CLOSE, "Client delivery failed");
    }
  }

  notify(channel: string, method: string, params: NotificationParams): void {
    let text: string | undefined;

    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      const client = this.connection(socket);

      if (client.phase === "ready" && client.subscriptions.includes(channel)) {
        text ??= this.serialize({
          jsonrpc: "2.0",
          method,
          params: { channel, ...params },
        });
        this.sendText(socket, text);
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

  validateSubscriptions(clientId: string, subscriptions: string[]): string[] {
    const unique = AttachmentLimitSchema.parse([...new Set(subscriptions)]);
    const attachment = { phase: "ready", clientId, subscriptions: unique };

    if (new TextEncoder().encode(JSON.stringify(attachment)).byteLength > MAX_ATTACHMENT_BYTES) {
      throw new ProtocolError(RpcCodes.params, "Subscriptions exceed the connection storage limit");
    }

    return unique;
  }

  attach(socket: WebSocket, clientId: string, subscriptions: string[]): void {
    const unique = this.validateSubscriptions(clientId, subscriptions);

    for (const existing of this.ctx.getWebSockets()) {
      const client = this.connection(existing);

      if (existing !== socket && client.phase === "ready" && client.clientId === clientId) {
        existing.close(VERSION_REJECT_CLOSE, "Client reconnected elsewhere");
      }
    }

    socket.serializeAttachment({
      phase: "ready",
      clientId,
      subscriptions: unique,
    });
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
          subscriptions: client.subscriptions.filter((uri) => !channels.includes(uri)),
        });
      }
    }
  }
}
