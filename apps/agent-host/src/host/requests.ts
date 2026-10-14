import * as z from "zod";
import { AhpErrorCodes, JsonRpcErrorCodes, PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import type {
  InitializeResult,
  ListSessionsResult,
  SubscribeResult,
} from "@experiments/protocol-schemas/ahp";
import {
  ChatTurnCancelledActionSchema,
  ChatTurnStartedActionSchema,
  CreateSessionParamsSchema,
  InitializeParamsSchema,
  ListSessionsParamsSchema,
  RootChannelParamsSchema,
  SubscribeParamsSchema,
} from "@experiments/protocol-schemas/ahp";
import {
  ChannelSchema,
  DispatchSchema,
  ProtocolError,
  errorMessage,
  send,
  sendError,
} from "../protocol";
import type { MessageSchema } from "../protocol";
import type { HostSessionsService } from "./service/sessions";
import type { ConnectionsService } from "./service/connections";

const NORMAL_CLOSE = 1000;

const ClientActionSchema = z.discriminatedUnion("type", [
  ChatTurnStartedActionSchema,
  ChatTurnCancelledActionSchema,
]);

type Message = z.output<typeof MessageSchema>;

type Request = Message & { id: string | number };

type RequestResult = InitializeResult | ListSessionsResult | SubscribeResult | null;

type Reply = (result: RequestResult) => void;

export type Host = { sessions: HostSessionsService; connections: ConnectionsService };

export async function handleMessage(
  host: Host,
  socket: WebSocket,
  message: Message,
): Promise<void> {
  const { id } = message;

  await (id === undefined
    ? handleNotification(host, socket, message)
    : handleRequest(host, socket, { ...message, id }));
}

async function handleRequest(host: Host, socket: WebSocket, request: Request): Promise<void> {
  const { sessions, connections } = host;
  const { method, params } = request;

  function reply(result: RequestResult): void {
    send(socket, { jsonrpc: "2.0", id: request.id, result });
  }

  if (method !== "initialize" && method !== "ping") {
    requireClientId(connections, socket);
  }

  switch (method) {
    case "initialize": {
      await initialize(host, socket, request, reply);
      break;
    }

    case "ping": {
      RootChannelParamsSchema.parse(params);
      reply(null);
      break;
    }

    case "subscribe": {
      const { channel } = SubscribeParamsSchema.parse(params);

      await connections.subscribe({
        socket,
        channels: [channel],
        load: (uri) => sessions.snapshot(uri),
        respond: ([snapshot]) => {
          reply({ snapshot });
        },
      });

      break;
    }

    case "listSessions": {
      ListSessionsParamsSchema.parse(params);
      reply(await sessions.list());
      break;
    }

    case "createSession": {
      await sessions.create(CreateSessionParamsSchema.parse(params));
      reply(null);
      break;
    }

    case "disposeSession": {
      await sessions.disposeChannel(ChannelSchema.parse(params).channel);
      reply(null);
      break;
    }

    case "dispatchAction":
    case "unsubscribe": {
      throw new ProtocolError("Expected a notification", JsonRpcErrorCodes.InvalidRequest);
    }

    default: {
      throw new ProtocolError("Method is not supported", JsonRpcErrorCodes.MethodNotFound);
    }
  }
}

// Unknown notifications are ignored, as JSON-RPC gives them no way to report an error.
async function handleNotification(host: Host, socket: WebSocket, message: Message): Promise<void> {
  const { connections } = host;

  switch (message.method) {
    case "dispatchAction": {
      await dispatch(host, socket, requireClientId(connections, socket), message);
      break;
    }

    case "unsubscribe": {
      requireClientId(connections, socket);
      connections.unsubscribe(socket, ChannelSchema.parse(message.params).channel);
      break;
    }

    default: {
      break;
    }
  }
}

async function initialize(
  host: Host,
  socket: WebSocket,
  request: Request,
  reply: Reply,
): Promise<void> {
  const { sessions, connections } = host;
  const params = InitializeParamsSchema.parse(request.params);

  if (connections.clientId(socket) !== undefined) {
    throw new ProtocolError("Connection is already initialized");
  }

  if (!params.protocolVersions.includes(PROTOCOL_VERSION)) {
    const error = new ProtocolError(
      "Unsupported protocol version",
      AhpErrorCodes.UnsupportedProtocolVersion,
      { supportedVersions: [PROTOCOL_VERSION] },
    );

    sendError(socket, request.id, error);
    socket.close(NORMAL_CLOSE, error.message);

    return;
  }

  const serverSeq = await sessions.serverSeq();

  await connections.subscribe({
    socket,
    channels: [...new Set(params.initialSubscriptions)],
    load: (uri) => sessions.snapshot(uri),
    respond: (snapshots) => {
      connections.initialize(socket, params.clientId);
      reply({ protocolVersion: PROTOCOL_VERSION, serverSeq, snapshots });
    },
  });
}

// Rejections are echoed to the dispatching client only; success arrives as a broadcast action.
async function dispatch(
  host: Host,
  socket: WebSocket,
  clientId: string,
  message: Message,
): Promise<void> {
  const { channel, clientSeq, action } = DispatchSchema.parse(message.params);
  const origin = { clientId, clientSeq };

  try {
    await host.sessions.dispatch(channel, { action: ClientActionSchema.parse(action), origin });
  } catch (error) {
    send(socket, {
      jsonrpc: "2.0",
      method: "action",
      params: {
        channel,
        action,
        origin,
        serverSeq: await host.sessions.nextSequence(),
        rejectionReason: errorMessage(error),
      },
    });
  }
}

function requireClientId(connections: ConnectionsService, socket: WebSocket): string {
  const clientId = connections.clientId(socket);

  if (clientId === undefined) {
    throw new ProtocolError("Initialize the connection first", JsonRpcErrorCodes.InvalidRequest);
  }

  return clientId;
}
