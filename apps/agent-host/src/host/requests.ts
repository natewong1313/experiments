import type * as z from "zod";
import { AhpErrorCodes, JsonRpcErrorCodes, PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import type {
  InitializeResult,
  ListSessionsResult,
  SubscribeResult,
} from "@experiments/protocol-schemas/ahp";
import {
  CreateSessionParamsSchema,
  InitializeParamsSchema,
  ListSessionsParamsSchema,
  SubscribeParamsSchema,
  ChatTurnStartedActionSchema,
  ChatTurnCancelledActionSchema,
} from "@experiments/protocol-schemas/ahp";
import {
  ChannelSchema,
  DispatchSchema,
  ProtocolError,
  ROOT_CHANNEL,
  send,
  errorMessage,
} from "../protocol";
import type { MessageSchema } from "../protocol";
import type { HostSessionsService } from "./service/sessions";
import type { ConnectionsService } from "./service/connections";
import type { HostRepository } from "./db/repositories/host";

type RequestOptions = {
  sessions: HostSessionsService;
  connections: ConnectionsService;
  hostRepository: HostRepository;
  socket: WebSocket;
  message: z.output<typeof MessageSchema>;
};

const NORMAL_CLOSE = 1000;

type RequestResult = InitializeResult | ListSessionsResult | SubscribeResult | null;

async function initialize(options: RequestOptions): Promise<void> {
  const { sessions, connections, hostRepository, socket, message } = options;
  const params = InitializeParamsSchema.parse(message.params);

  if (connections.attachment(socket).clientId !== undefined) {
    throw new ProtocolError("Connection is already initialized");
  }

  if (!params.protocolVersions.includes(PROTOCOL_VERSION)) {
    send(socket, {
      jsonrpc: "2.0",
      id: message.id ?? null,
      error: {
        code: AhpErrorCodes.UnsupportedProtocolVersion,
        message: "Unsupported protocol version",
        data: { supportedVersions: [PROTOCOL_VERSION] },
      },
    });
    socket.close(NORMAL_CLOSE, "Unsupported protocol version");

    return;
  }

  const channels = [...new Set(params.initialSubscriptions)];

  for (const channel of channels) {
    connections.begin(socket, channel);
  }

  try {
    const currentHost = await hostRepository.get();
    const serverSeq = currentHost?.serverSeq ?? 0;
    const snapshots = await Promise.all(channels.map((channel) => sessions.snapshot(channel)));
    connections.initialize(socket, params.clientId);

    const result: InitializeResult = {
      protocolVersion: PROTOCOL_VERSION,
      serverSeq,
      snapshots: snapshots.map((item) => item.snapshot),
    };

    send(socket, { jsonrpc: "2.0", id: message.id ?? 0, result });

    for (const item of snapshots) {
      connections.finish(socket, item.snapshot.resource, item.revision);
    }
  } finally {
    connections.cancel(socket);
  }
}

async function subscribe(options: RequestOptions): Promise<void> {
  const { sessions, connections, socket, message } = options;
  const params = SubscribeParamsSchema.parse(message.params);
  connections.begin(socket, params.channel);

  try {
    const result = await sessions.snapshot(params.channel);
    send(socket, { jsonrpc: "2.0", id: message.id ?? 0, result: { snapshot: result.snapshot } });
    connections.finish(socket, params.channel, result.revision);
  } finally {
    connections.cancel(socket);
  }
}

async function dispatch(options: RequestOptions): Promise<void> {
  const { sessions, connections, hostRepository, socket, message } = options;
  const params = DispatchSchema.parse(message.params);
  const { clientId } = connections.attachment(socket);
  const origin = { clientId: clientId ?? "", clientSeq: params.clientSeq };
  let rejection: string | null;

  try {
    const entry = await sessions.resolveSession(params.channel);

    if (!params.channel.startsWith("ahp-chat:/")) {
      throw new ProtocolError("Session actions are not supported");
    }

    if (params.action.type !== "chat/turnStarted" && params.action.type !== "chat/turnCancelled") {
      throw new ProtocolError("Action is not supported");
    }

    const action =
      params.action.type === "chat/turnStarted"
        ? ChatTurnStartedActionSchema.parse(params.action)
        : ChatTurnCancelledActionSchema.parse(params.action);

    const stub = await sessions.sessionStub(entry.id);
    await stub.dispatch({ action, origin });

    rejection = null;
  } catch (error) {
    rejection = errorMessage(error);
  }

  if (rejection !== null) {
    send(socket, {
      jsonrpc: "2.0",
      method: "action",
      params: {
        channel: params.channel,
        action: params.action,
        origin,
        serverSeq: await hostRepository.nextSequence(),
        rejectionReason: rejection,
      },
    });
  }
}

async function request(options: RequestOptions): Promise<RequestResult> {
  const { sessions, message } = options;

  switch (message.method) {
    case "ping": {
      const params = ChannelSchema.parse(message.params);

      if (params.channel !== ROOT_CHANNEL) {
        throw new ProtocolError("Expected the root channel");
      }

      return null;
    }

    case "listSessions": {
      ListSessionsParamsSchema.parse(message.params);

      return await sessions.list();
    }

    case "createSession": {
      const params = CreateSessionParamsSchema.parse(message.params);
      await sessions.create(params);

      return null;
    }

    case "disposeSession": {
      const params = ChannelSchema.parse(message.params);
      await sessions.disposeChannel(params.channel);

      return null;
    }

    default: {
      throw new ProtocolError("Method is not supported", JsonRpcErrorCodes.MethodNotFound);
    }
  }
}

export async function handleRequest(options: RequestOptions): Promise<void> {
  const { connections, socket, message } = options;

  if (
    message.method !== "initialize" &&
    message.method !== "ping" &&
    connections.attachment(socket).clientId === undefined
  ) {
    throw new ProtocolError("Initialize the connection first", JsonRpcErrorCodes.InvalidRequest);
  }

  if (message.method === "dispatchAction" || message.method === "unsubscribe") {
    if (message.id !== undefined) {
      throw new ProtocolError("Expected a notification", JsonRpcErrorCodes.InvalidRequest);
    }

    if (message.method === "dispatchAction") {
      await dispatch(options);
    } else {
      const params = ChannelSchema.parse(message.params);
      connections.unsubscribe(socket, params.channel);
    }

    return;
  }

  if (message.id === undefined) {
    return;
  }

  if (message.method === "initialize") {
    await initialize(options);
  } else if (message.method === "subscribe") {
    await subscribe(options);
  } else {
    const result = await request(options);
    send(socket, { jsonrpc: "2.0", id: message.id, result });
  }
}
