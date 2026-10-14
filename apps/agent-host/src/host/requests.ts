import type * as z from "zod";
import {
  AhpErrorCodes,
  JsonRpcErrorCodes,
  PROTOCOL_VERSION,
  SessionStatus,
} from "@microsoft/agent-host-protocol";
import type {
  InitializeResult,
  ListSessionsResult,
  Snapshot,
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
  channelId,
  send,
  errorMessage,
} from "../protocol";
import type { MessageSchema } from "../protocol";
import type { AgentHost } from "./durable-object";
import type { HostDatabase } from "./db/database";

type RequestOptions<Env> = {
  host: AgentHost<Env>;
  db: HostDatabase;
  socket: WebSocket;
  message: z.output<typeof MessageSchema>;
};

type SnapshotResult = { snapshot: Snapshot; revision: number };

const NORMAL_CLOSE = 1000;

type RequestResult = InitializeResult | ListSessionsResult | SubscribeResult | null;

async function snapshot<Env>(
  options: Pick<RequestOptions<Env>, "host" | "db">,
  channel: string,
): Promise<SnapshotResult> {
  const { host, db } = options;
  const currentHost = await db.host.get();
  const fromSeq = currentHost?.serverSeq ?? 0;

  if (channel === ROOT_CHANNEL) {
    return {
      snapshot: { resource: channel, state: await host.rootState(), fromSeq },
      revision: fromSeq,
    };
  }

  const entry = await host.resolveSession(channel);
  const stub = await host.sessionStub(entry.id);
  const response = await stub.snapshot({ channel });

  return {
    snapshot: { resource: channel, state: response.state, fromSeq },
    revision: response.revision,
  };
}

async function initialize<Env>(options: RequestOptions<Env>): Promise<void> {
  const { host, db, socket, message } = options;
  const params = InitializeParamsSchema.parse(message.params);

  if (host.connections.attachment(socket).clientId !== undefined) {
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
    host.connections.begin(socket, channel);
  }

  try {
    const currentHost = await db.host.get();
    const serverSeq = currentHost?.serverSeq ?? 0;
    const snapshots = await Promise.all(channels.map((channel) => snapshot({ host, db }, channel)));
    host.connections.initialize(socket, params.clientId);

    const result: InitializeResult = {
      protocolVersion: PROTOCOL_VERSION,
      serverSeq,
      snapshots: snapshots.map((item) => item.snapshot),
    };

    send(socket, { jsonrpc: "2.0", id: message.id ?? 0, result });

    for (const item of snapshots) {
      host.connections.finish(socket, item.snapshot.resource, item.revision);
    }
  } finally {
    host.connections.cancel(socket);
  }
}

async function subscribe<Env>(options: RequestOptions<Env>): Promise<void> {
  const { host, db, socket, message } = options;
  const params = SubscribeParamsSchema.parse(message.params);
  host.connections.begin(socket, params.channel);

  try {
    const result = await snapshot({ host, db }, params.channel);
    send(socket, { jsonrpc: "2.0", id: message.id ?? 0, result: { snapshot: result.snapshot } });
    host.connections.finish(socket, params.channel, result.revision);
  } finally {
    host.connections.cancel(socket);
  }
}

async function createSession<Env>(options: RequestOptions<Env>): Promise<null> {
  const { host, db, message } = options;
  const params = CreateSessionParamsSchema.parse(message.params);
  const id = channelId(params.channel, "ahp-session");
  const agent = host.agentInfo();

  if (params.provider !== undefined && params.provider !== agent.provider) {
    throw new ProtocolError("Agent provider does not exist", AhpErrorCodes.ProviderNotFound);
  }

  if (await db.sessions.get(id)) {
    throw new ProtocolError("Session already exists", AhpErrorCodes.SessionAlreadyExists);
  }

  if (params.config || params.activeClient || (params.workingDirectories?.length ?? 0) > 1) {
    throw new ProtocolError(
      "Session configuration and multiple working directories are not supported",
    );
  }

  const directory = params.workingDirectories?.[0];
  let workingDirectory: string | undefined;

  if (directory !== undefined) {
    const url = new URL(directory);

    if (url.protocol !== "file:" || url.hostname || url.search || url.hash) {
      throw new ProtocolError("Expected a local file working directory");
    }

    workingDirectory = decodeURIComponent(url.pathname);
  }

  const currentHost = await db.host.get();
  const hostId = currentHost?.id;

  if (hostId === undefined) {
    throw new ProtocolError("Host is not initialized");
  }

  const now = new Date().toISOString();
  const chatId = crypto.randomUUID();

  const entry = {
    id,
    defaultChatId: chatId,
    summary: {
      resource: params.channel,
      provider: agent.provider,
      title: "New session",
      status: SessionStatus.Idle,
      createdAt: now,
      modifiedAt: now,
    },
  };

  await db.sessions.create(entry);
  host.connections.notify(ROOT_CHANNEL, {
    jsonrpc: "2.0",
    method: "root/sessionAdded",
    params: { channel: ROOT_CHANNEL, summary: entry.summary },
  });
  await host.catalogueChanged();

  try {
    const stub = await host.sessionStub(id);
    await stub.create({
      hostId,
      sessionId: id,
      chatId,
      provider: agent.provider,
      createdAt: now,
      workingDirectory,
    });

    return null;
  } catch (error) {
    await host.disposeSession(entry);
    throw new ProtocolError(errorMessage(error));
  }
}

async function dispatch<Env>(options: RequestOptions<Env>): Promise<void> {
  const { host, db, socket, message } = options;
  const params = DispatchSchema.parse(message.params);
  const { clientId } = host.connections.attachment(socket);
  const origin = { clientId: clientId ?? "", clientSeq: params.clientSeq };
  let rejection: string | null;

  try {
    const entry = await host.resolveSession(params.channel);

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

    const stub = await host.sessionStub(entry.id);
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
        serverSeq: await db.host.nextSequence(),
        rejectionReason: rejection,
      },
    });
  }
}

async function request<Env>(options: RequestOptions<Env>): Promise<RequestResult> {
  const { host, db, message } = options;

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
      const entries = await db.sessions.list();

      return {
        items: entries.map((entry) => entry.summary),
      };
    }

    case "createSession": {
      return await createSession(options);
    }

    case "disposeSession": {
      const params = ChannelSchema.parse(message.params);
      const id = channelId(params.channel, "ahp-session");
      const entry = await db.sessions.get(id);

      if (!entry) {
        throw new ProtocolError("Session does not exist", AhpErrorCodes.SessionNotFound);
      }

      await host.disposeSession(entry);

      return null;
    }

    default: {
      throw new ProtocolError("Method is not supported", JsonRpcErrorCodes.MethodNotFound);
    }
  }
}

export async function handleRequest<Env>(options: RequestOptions<Env>): Promise<void> {
  const { host, socket, message } = options;

  if (
    message.method !== "initialize" &&
    message.method !== "ping" &&
    host.connections.attachment(socket).clientId === undefined
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
      host.connections.unsubscribe(socket, params.channel);
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
