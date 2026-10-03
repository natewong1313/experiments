import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import * as z from "zod";
import {
  ChannelParamsSchema,
  RootChannelParamsSchema,
  InitializeParamsSchema,
  ReconnectParamsSchema,
  SubscribeParamsSchema,
  CreateSessionParamsSchema,
  ListSessionsParamsSchema,
  FetchTurnsParamsSchema,
  DispatchActionParamsSchema,
  JsonRpcCallSchema,
  type JsonRpcCall,
} from "@experiments/protocol-schemas/ahp";
import {
  ROOT,
  MAX_FRAME_BYTES,
  DEFAULT_PAGE_SIZE,
  INVALID_FRAME_CLOSE,
  VERSION_REJECT_CLOSE,
  ProtocolError,
  RpcCodes,
  parseHostParams,
  errorMessage,
  type JsonValue,
  type RpcResult,
} from "./protocol";
import type { AhpClients } from "./clients";
import type { ActionDispatch } from "./dispatch";
import type { HostStore } from "../state/store";
import type { SessionLifecycle } from "../sessions/lifecycle";

import { MemoryLimitError } from "../memory";

type RpcErrorResponse = { code: number; message: string; data?: JsonValue };

type AhpRpcParams = {
  store: HostStore;
  clients: AhpClients;
  sessions: SessionLifecycle;
  dispatcher: ActionDispatch;
  defaultDirectory: string;
};

class AhpRpc {
  private readonly store: HostStore;
  private readonly clients: AhpClients;
  private readonly sessions: SessionLifecycle;
  private readonly dispatcher: ActionDispatch;
  private readonly defaultDirectory: string;

  constructor({
    store,
    clients,
    sessions,
    dispatcher,
    defaultDirectory,
  }: AhpRpcParams) {
    this.store = store;
    this.clients = clients;
    this.sessions = sessions;
    this.dispatcher = dispatcher;
    this.defaultDirectory = defaultDirectory;
  }

  async message(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const text = z.string().safeParse(message);

    if (
      !text.success ||
      text.data.length > MAX_FRAME_BYTES ||
      new TextEncoder().encode(text.data).byteLength > MAX_FRAME_BYTES
    ) {
      socket.close(INVALID_FRAME_CLOSE, "AHP requires bounded text frames");

      return;
    }

    let value: unknown;

    try {
      value = JSON.parse(text.data);
    } catch {
      this.clients.send(socket, {
        jsonrpc: "2.0",
        id: null,
        error: { code: RpcCodes.parse, message: "Invalid JSON" },
      });

      return;
    }

    const parsed = JsonRpcCallSchema.safeParse(value);

    if (!parsed.success) {
      this.clients.send(socket, {
        jsonrpc: "2.0",
        id: null,
        error: { code: RpcCodes.request, message: "Invalid JSON-RPC request" },
      });

      return;
    }

    const frame = parsed.data;

    try {
      const result = await this.command(socket, frame);

      if (frame.id !== void 0) {
        this.clients.send(socket, { jsonrpc: "2.0", id: frame.id, result });
      }
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error("Unknown error");

      this.respondError(socket, frame, normalized);
    }
  }

  private respondError(
    socket: WebSocket,
    frame: JsonRpcCall,
    error: Error,
  ): void {
    let code = RpcCodes.internal;

    if (error instanceof ProtocolError) {
      ({ code } = error);
    } else if (
      error instanceof z.ZodError ||
      error instanceof MemoryLimitError
    ) {
      code = RpcCodes.params;
    }

    const message =
      code === RpcCodes.internal ? "Host request failed" : errorMessage(error);

    const data = error instanceof ProtocolError ? error.data : void 0;

    if (frame.id !== void 0) {
      this.clients.send(socket, {
        jsonrpc: "2.0",
        id: frame.id,
        error: this.errorResponse(code, message, data),
      });
    }

    if (code === RpcCodes.version) {
      socket.close(VERSION_REJECT_CLOSE, "Unsupported protocol version");
    }

    if (code === RpcCodes.internal) {
      console.error({
        event: "host_request_failed",
        method: frame.method,
        error: errorMessage(error),
      });
    }
  }

  private errorResponse(
    code: number,
    message: string,
    data: JsonValue | undefined,
  ): RpcErrorResponse {
    const response: RpcErrorResponse = { code, message };

    if (data !== void 0) {
      response.data = data;
    }

    return response;
  }

  private initialize(
    socket: WebSocket,
    params: JsonRpcCall["params"],
  ): RpcResult {
    if (this.clients.connection(socket).phase !== "new") {
      throw new ProtocolError(
        RpcCodes.request,
        "Connection is already initialized",
      );
    }

    const input = parseHostParams(InitializeParamsSchema, params);

    if (!input.protocolVersions.includes(PROTOCOL_VERSION)) {
      throw new ProtocolError(
        RpcCodes.version,
        "Unsupported protocol version",
        { supportedVersions: [PROTOCOL_VERSION] },
      );
    }

    const subscriptions = this.clients.validateSubscriptions(
      input.clientId,
      (input.initialSubscriptions ?? []).filter(
        (channel) => channel === ROOT || this.store.exists(channel),
      ),
    );

    const snapshots = this.store.snapshots(subscriptions);

    this.clients.attach(socket, input.clientId, subscriptions);

    return {
      protocolVersion: PROTOCOL_VERSION,
      serverSeq: this.store.sequence,
      snapshots,
      serverInfo: { name: "cloudflare-agent-host", version: "0.0.0" },
      defaultDirectory: this.defaultDirectory,
    };
  }

  private reconnect(
    socket: WebSocket,
    params: JsonRpcCall["params"],
  ): RpcResult {
    const input = parseHostParams(ReconnectParamsSchema, params);

    const available = this.clients.validateSubscriptions(
      input.clientId,
      input.subscriptions.filter(
        (channel) => channel === ROOT || this.store.exists(channel),
      ),
    );

    const actions = this.store.replay(input.lastSeenServerSeq, available);

    const result =
      actions === null
        ? {
            type: "snapshot",
            snapshots: this.store.snapshots(available),
          }
        : {
            type: "replay",
            actions,
            missing: input.subscriptions.filter(
              (channel) => !available.includes(channel),
            ),
          };

    this.clients.attach(socket, input.clientId, available);

    return result;
  }

  private async command(
    socket: WebSocket,
    frame: JsonRpcCall,
  ): Promise<RpcResult> {
    const { method, params } = frame;

    if (method === "ping") {
      parseHostParams(RootChannelParamsSchema, params);

      return null;
    }

    if (method === "initialize") {
      return this.initialize(socket, params);
    }

    if (method === "reconnect") {
      return this.reconnect(socket, params);
    }

    const client = this.clients.connection(socket);

    if (client.phase !== "ready") {
      throw new ProtocolError(
        RpcCodes.request,
        "Initialize the connection first",
      );
    }

    switch (method) {
      case "subscribe": {
        const { channel, view } = parseHostParams(
          SubscribeParamsSchema,
          params,
        );

        const subscriptions = this.clients.validateSubscriptions(
          client.clientId,
          [...client.subscriptions, channel],
        );

        const snapshot = this.store.snapshot(channel, view?.turns);
        this.clients.attach(socket, client.clientId, subscriptions);

        return { snapshot };
      }

      case "unsubscribe": {
        const { channel } = parseHostParams(ChannelParamsSchema, params);
        this.clients.unsubscribe(socket, channel);

        return null;
      }

      case "listSessions": {
        return this.listSessions(params);
      }

      case "createSession": {
        this.sessions.create(
          parseHostParams(CreateSessionParamsSchema, params),
        );

        return null;
      }

      case "disposeSession": {
        const { channel } = parseHostParams(ChannelParamsSchema, params);
        await this.sessions.dispose(channel);

        return null;
      }

      case "fetchTurns": {
        const input = parseHostParams(FetchTurnsParamsSchema, params);
        const publication = this.store.fetchTurns(input.channel, input.cursor);

        if (publication) {
          this.clients.broadcast(publication);

          if (!client.subscriptions.includes(input.channel)) {
            this.clients.send(socket, {
              jsonrpc: "2.0",
              method: "action",
              params: publication.actions[0],
            });
          }
        }

        return {};
      }

      case "dispatchAction": {
        this.dispatcher.dispatch(
          socket,
          client,
          parseHostParams(DispatchActionParamsSchema, params),
        );

        return null;
      }

      default: {
        throw new ProtocolError(RpcCodes.method, "Method not found");
      }
    }
  }

  private listSessions(params: JsonRpcCall["params"]): RpcResult {
    const input = parseHostParams(ListSessionsParamsSchema, params);

    return this.store.list({
      cursor: input.cursor,
      limit: input.limit ?? DEFAULT_PAGE_SIZE,
    });
  }
}

export { AhpRpc };
