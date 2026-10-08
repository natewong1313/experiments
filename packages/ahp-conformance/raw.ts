import {
  ActionEnvelopeSchema,
  JsonRpcNotificationSchema,
  JsonRpcReplySchema,
  JsonRpcRequestSchema,
  type ActionEnvelope,
  type JsonRpcNotification,
  type JsonRpcReply,
  type JsonRpcRequest,
} from "@experiments/protocol-schemas";
import { JsonRpcErrorCodes, PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { isWireRecord, isWireValue, type WireValue } from "./guards";

export const ROOT = "ahp-root://";

export const LATEST_VERSION = PROTOCOL_VERSION;

const FIRST_REQUEST_ID = 1;

const CONNECT_TIMEOUT_MS = 10_000;

const REQUEST_TIMEOUT_MS = 30_000;

const ACTION_TIMEOUT_MS = 10_000;

const CLOSE_TIMEOUT_MS = 2000;

const RECONNECT_CHECK_MS = 5000;

const MAX_RECEIVED_MESSAGES = 10_000;

const INITIAL_RECEIVE_INDEX = 0;

const LAST_EVENT_OFFSET = -1;

type WireParams = Record<string, WireValue>;

export type ActionWaitOptions = {
  after: number;
  predicate?(envelope: ActionEnvelope): boolean;
  timeoutMs?: number;
};

export type ReceivedMessage = Readonly<
  { index: number; raw: string } & (
    | { kind: "action"; message: JsonRpcNotification; action: ActionEnvelope }
    | { kind: "notification"; message: JsonRpcNotification }
    | { kind: "request"; message: JsonRpcRequest }
    | { kind: "reply"; message: JsonRpcReply }
    | { kind: "invalid"; error: Error }
  )
>;

type Pending<T> = {
  resolve(value: T): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

type ActionWait = Pending<ActionEnvelope> &
  ActionWaitOptions & {
    channel: string;
    actionType: string;
  };

function decodeMessage(raw: string, index: number): ReceivedMessage {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`AHP WebSocket text frame at receive index ${index} was not JSON`, {
      cause: error,
    });
  }

  const notification = JsonRpcNotificationSchema.safeParse(value);

  if (notification.success) {
    if (notification.data.method !== "action") {
      return { index, raw, kind: "notification", message: notification.data };
    }

    const parsed = ActionEnvelopeSchema.safeParse(notification.data.params);

    if (!parsed.success) {
      throw new Error(`Malformed AHP action at receive index ${index}: ${parsed.error.message}`);
    }

    const action = parsed.data;

    return {
      index,
      raw,
      kind: "action",
      message: { ...notification.data, params: action },
      action,
    };
  }

  const request = JsonRpcRequestSchema.safeParse(value);

  if (request.success) {
    return { index, raw, kind: "request", message: request.data };
  }

  const reply = JsonRpcReplySchema.safeParse(value);

  if (!reply.success) {
    throw new Error(`Malformed JSON-RPC message at receive index ${index}: ${reply.error.message}`);
  }

  return { index, raw, kind: "reply", message: reply.data };
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isReplyId(value: string | number): value is number {
  return typeof value === "number";
}

function freezeWireValue(value: WireValue): void {
  if (Array.isArray(value)) {
    if (!Object.isFrozen(value)) {
      for (const item of value) {
        freezeWireValue(item);
      }

      Object.freeze(value);
    }

    return;
  }

  if (!isWireRecord(value) || Object.isFrozen(value)) {
    return;
  }

  for (const item of Object.values(value)) {
    freezeWireValue(item);
  }

  Object.freeze(value);
}

function freezeMessage(event: ReceivedMessage): void {
  for (const value of Object.values(event)) {
    if (isWireValue(value)) {
      freezeWireValue(value);
    }
  }

  Object.freeze(event);
}

export class AhpConnection {
  private nextId = FIRST_REQUEST_ID;
  private receiveIndex = INITIAL_RECEIVE_INDEX;
  private readonly transcript: ReceivedMessage[] = [];
  private readonly requests: Map<number, Pending<JsonRpcReply>> = new Map();
  private readonly actionWaits: Set<ActionWait> = new Set();
  private readonly closeWaits: Map<(closed: boolean) => void, NodeJS.Timeout> = new Map();
  private opening?: Pending<void>;
  private failure?: Error;
  private closing?: Promise<void>;
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", this.onMessage);
    socket.addEventListener("error", this.onError);
    socket.addEventListener("close", this.onClose);
  }

  get checkpoint(): number {
    return this.receiveIndex;
  }

  get events(): readonly ReceivedMessage[] {
    return Object.freeze([...this.transcript]);
  }

  static async open(url: string): Promise<AhpConnection> {
    const connection = new AhpConnection(new WebSocket(url));
    await new Promise<void>((resolve, reject) => {
      connection.opening = {
        resolve,
        reject,
        timer: setTimeout(() => {
          connection.fail(new Error(`Timed out connecting to ${url}`));
        }, CONNECT_TIMEOUT_MS),
      };
      connection.socket.addEventListener("open", connection.onOpen, {
        once: true,
      });
    });

    return connection;
  }

  private readonly onOpen = (): void => {
    const { opening } = this;

    if (opening) {
      clearTimeout(opening.timer);
      delete this.opening;
      opening.resolve();
    }
  };

  private readonly onError = (): void => {
    this.fail(new Error("WebSocket connection failed"));
  };

  private readonly onClose = (event: CloseEvent): void => {
    this.fail(
      new Error(`Connection closed (code ${event.code}${event.reason ? `: ${event.reason}` : ""})`),
    );
    this.removeSocketListeners();
    this.settleCloseWaits(true);
  };

  private removeSocketListeners(): void {
    this.socket.removeEventListener("open", this.onOpen);
    this.socket.removeEventListener("message", this.onMessage);
    this.socket.removeEventListener("error", this.onError);
    this.socket.removeEventListener("close", this.onClose);
  }

  private settleCloseWaits(closed: boolean): void {
    for (const [resolve, timer] of this.closeWaits) {
      clearTimeout(timer);
      resolve(closed);
    }

    this.closeWaits.clear();
  }

  private fail(error: Error): void {
    if (this.failure) {
      return;
    }

    this.failure = error;
    this.socket.removeEventListener("message", this.onMessage);
    this.socket.removeEventListener("open", this.onOpen);

    if (this.opening) {
      clearTimeout(this.opening.timer);
      this.opening.reject(error);
      delete this.opening;
    }

    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    this.requests.clear();

    for (const wait of this.actionWaits) {
      clearTimeout(wait.timer);
      wait.reject(error);
    }

    this.actionWaits.clear();

    if (
      this.socket.readyState !== WebSocket.CLOSED &&
      this.socket.readyState !== WebSocket.CLOSING
    ) {
      this.socket.close();
    }
  }

  private requireOpen(): void {
    if (this.failure) {
      throw this.failure;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket connection is not open");
    }
  }

  private record(event: ReceivedMessage): void {
    freezeMessage(event);
    this.transcript.push(event);
  }

  private readonly onMessage = (event: MessageEvent): void => {
    this.receiveIndex += 1;
    const index = this.receiveIndex;

    const text = isText(event.data) ? event.data : null;

    const raw = text ?? "[non-text frame]";

    if (this.transcript.length === MAX_RECEIVED_MESSAGES) {
      this.fail(
        new Error(
          `AHP recorder overflow at receive index ${index}; limit is ${MAX_RECEIVED_MESSAGES} messages`,
        ),
      );

      return;
    }

    try {
      if (text === null) {
        throw new Error(`AHP WebSocket message at receive index ${index} was not a text frame`);
      }

      const received = decodeMessage(text, index);
      this.record(received);

      if (received.kind === "action") {
        this.resolveActionWaits(received);
      }

      if (received.kind === "request") {
        this.socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: received.message.id,
            error: {
              code: JsonRpcErrorCodes.MethodNotFound,
              message: `Raw conformance client does not implement ${received.message.method}`,
            },
          }),
        );
      }

      if (received.kind === "reply") {
        const { id } = received.message;

        if (!isReplyId(id)) {
          return;
        }

        const pending = this.requests.get(id);

        if (pending) {
          this.requests.delete(id);
          clearTimeout(pending.timer);
          pending.resolve(received.message);
        }
      }
    } catch (error) {
      const failure =
        error instanceof Error
          ? error
          : new Error("AHP message processing failed", { cause: error });

      if (this.transcript.at(LAST_EVENT_OFFSET)?.index !== index) {
        this.record({ index, raw, kind: "invalid", error: failure });
      }

      this.fail(failure);
    }
  };

  private resolveActionWaits(event: ReceivedMessage): void {
    for (const wait of this.actionWaits) {
      try {
        if (!this.matches(event, wait.channel, wait.actionType, wait)) {
          continue;
        }

        this.actionWaits.delete(wait);
        clearTimeout(wait.timer);
        wait.resolve(event.action);
      } catch (error) {
        this.actionWaits.delete(wait);
        clearTimeout(wait.timer);
        wait.reject(
          error instanceof Error ? error : new Error("Action predicate failed", { cause: error }),
        );
      }
    }
  }

  async request(method: string, params: WireParams): Promise<JsonRpcReply> {
    this.requireOpen();
    const id = this.nextId++;
    const frame = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    return await new Promise<JsonRpcReply>((resolve, reject) => {
      const pending = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.requests.delete(id);
          reject(new Error(`Timed out waiting for ${method}`));
        }, REQUEST_TIMEOUT_MS),
      };

      this.requests.set(id, pending);

      try {
        this.socket.send(frame);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(`Failed to send ${method}`));
      }
    });
  }

  notify(method: string, params: WireParams): void {
    this.requireOpen();
    const frame = JSON.stringify({ jsonrpc: "2.0", method, params });

    try {
      this.socket.send(frame);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(`Failed to send ${method}`);

      this.fail(failure);
      throw failure;
    }
  }

  private matches(
    event: ReceivedMessage,
    channel: string,
    actionType: string,
    options: ActionWaitOptions,
  ): event is ReceivedMessage & { kind: "action" } {
    return (
      event.kind === "action" &&
      event.index > options.after &&
      event.action.channel === channel &&
      event.action.action.type === actionType &&
      (!options.predicate || options.predicate(event.action))
    );
  }

  async waitForAction(
    channel: string,
    actionType: string,
    options: ActionWaitOptions,
  ): Promise<ActionEnvelope> {
    this.requireOpen();

    if (
      !Number.isSafeInteger(options.after) ||
      options.after < INITIAL_RECEIVE_INDEX ||
      options.after > this.receiveIndex
    ) {
      throw new Error(
        `Invalid receive checkpoint ${options.after}; current checkpoint is ${this.receiveIndex}`,
      );
    }

    for (const event of this.transcript) {
      if (this.matches(event, channel, actionType, options)) {
        return event.action;
      }
    }

    return await new Promise<ActionEnvelope>((resolve, reject) => {
      const wait: ActionWait = {
        ...options,
        channel,
        actionType,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.actionWaits.delete(wait);
          reject(
            new Error(
              `Timed out waiting for ${actionType} on ${channel} after receive index ${options.after}`,
            ),
          );
        }, options.timeoutMs ?? ACTION_TIMEOUT_MS),
      };

      this.actionWaits.add(wait);
    });
  }

  async waitForClose(timeoutMs = RECONNECT_CHECK_MS): Promise<boolean> {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.closeWaits.delete(resolve);
        resolve(false);
      }, timeoutMs);

      this.closeWaits.set(resolve, timer);
    });
  }

  private async finishClosing(): Promise<void> {
    this.fail(new Error("Connection closed by client"));
    const closed = await this.waitForClose(CLOSE_TIMEOUT_MS);

    if (!closed) {
      this.removeSocketListeners();
      this.settleCloseWaits(false);
    }
  }

  close(): Promise<void> {
    this.closing ??= this.finishClosing();

    return this.closing;
  }
}

export async function initialize(
  connection: AhpConnection,
  subscriptions: string[] = [],
): Promise<JsonRpcReply> {
  return await connection.request("initialize", {
    channel: ROOT,
    protocolVersions: [LATEST_VERSION],
    clientId: `conformance-${crypto.randomUUID()}`,
    clientInfo: { name: "ahp-conformance", version: "0.1.0" },
    initialSubscriptions: subscriptions,
  });
}
