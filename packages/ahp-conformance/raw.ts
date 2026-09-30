import {
  ActionEnvelopeSchema,
  JsonRpcNotificationSchema,
  JsonRpcReplySchema,
  type ActionEnvelope,
  type JsonRpcReply,
} from "@experiments/protocol-schemas";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";

const ROOT = "ahp-root://";
const LATEST_VERSION = PROTOCOL_VERSION;
const FIRST_REQUEST_ID = 1;
const CONNECT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 2000;
const RECONNECT_CHECK_MS = 5000;

type WaitOptions = {
  timeoutMs: number;
  description: string;
};

function waitForSocketEvent(socket: WebSocket, options: WaitOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out ${options.description}`));
    }, options.timeoutMs);
    function onOpen(): void {
      cleanup();
      resolve();
    }

    function onError(): void {
      cleanup();
      reject(new Error(`WebSocket connection failed while ${options.description}`));
    }

    function cleanup(): void {
      clearTimeout(timer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
    }
    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
  });
}

function parseMessage(event: MessageEvent): unknown {
  if (typeof event.data !== "string") {
    throw new Error("AHP WebSocket message was not a text frame");
  }
  try {
    const value: unknown = JSON.parse(event.data);
    return value;
  } catch {
    throw new Error("AHP WebSocket text frame was not JSON");
  }
}

class AhpConnection {
  private nextId = FIRST_REQUEST_ID;

  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
  }

  static async open(url: string): Promise<AhpConnection> {
    const socket = new WebSocket(url);
    await waitForSocketEvent(socket, { timeoutMs: CONNECT_TIMEOUT_MS, description: `connecting to ${url}` });
    return new AhpConnection(socket);
  }

  async request(method: string, params: Record<string, unknown>): Promise<JsonRpcReply> {
    const { socket } = this;
    const id = this.nextId;
    this.nextId += 1;
    return await new Promise<JsonRpcReply>((resolve, reject) => {
      function cleanup(): void {
        clearTimeout(timer);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("close", onClose);
      }

      function onClose(): void {
        cleanup();
        reject(new Error(`Connection closed while waiting for ${method}`));
      }

      function onMessage(event: MessageEvent): void {
        let value: unknown;
        try {
          value = parseMessage(event);
        } catch (error) {
          cleanup();
          reject(error instanceof Error ? error : new Error("Message parse failed"));
          return;
        }
        const isNotification = JsonRpcNotificationSchema.safeParse(value).success;
        if (isNotification) {
          return;
        }
        const parsed = JsonRpcReplySchema.safeParse(value);
        if (!parsed.success) {
          cleanup();
          reject(new Error(`Malformed JSON-RPC response to ${method}: ${event.data}`));
          return;
        }
        if (parsed.data.id !== id) {
          return;
        }
        cleanup();
        resolve(parsed.data);
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.socket.addEventListener("message", onMessage);
      this.socket.addEventListener("close", onClose, { once: true });
      this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.socket.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  async waitForAction(channel: string, actionType: string): Promise<ActionEnvelope> {
    const { socket } = this;
    return await new Promise<ActionEnvelope>((resolve, reject) => {
      function onMessage(event: MessageEvent): void {
        let value: unknown;
        try {
          value = parseMessage(event);
        } catch {
          return;
        }
        const parsed = ActionEnvelopeSchema.safeParse(value);
        if (!parsed.success) {
          return;
        }
        const envelope = parsed.data;
        const { action } = envelope;
        if (envelope.channel !== channel || action.type !== actionType) {
          return;
        }
        cleanup();
        resolve(envelope);
      }

      function cleanup(): void {
        clearTimeout(timer);
        socket.removeEventListener("message", onMessage);
      }

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${actionType} on ${channel}`));
      }, ACTION_TIMEOUT_MS);
      this.socket.addEventListener("message", onMessage);
    });
  }

  async waitForClose(timeoutMs = RECONNECT_CHECK_MS): Promise<boolean> {
    const { socket } = this;
    if (socket.readyState === WebSocket.CLOSED) {
      return true;
    }
    return await new Promise<boolean>((resolve) => {
      function onClose(): void {
        clearTimeout(timer);
        resolve(true);
      }
      const timer = setTimeout(() => {
        socket.removeEventListener("close", onClose);
        resolve(false);
      }, timeoutMs);
      socket.addEventListener("close", onClose, { once: true });
    });
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CLOSE_TIMEOUT_MS);
      function onClose(): void {
        clearTimeout(timer);
        resolve();
      }

      this.socket.addEventListener("close", onClose, { once: true });
      this.socket.close();
    });
  }
}

async function initialize(connection: AhpConnection, subscriptions: string[] = []): Promise<JsonRpcReply> {
  return await connection.request("initialize", {
    channel: ROOT,
    protocolVersions: [LATEST_VERSION],
    clientId: `conformance-${crypto.randomUUID()}`,
    clientInfo: { name: "ahp-conformance", version: "0.1.0" },
    initialSubscriptions: subscriptions,
  });
}

export { AhpConnection, initialize, ROOT, LATEST_VERSION };
