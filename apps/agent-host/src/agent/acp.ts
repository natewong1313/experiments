import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  type Client,
} from "@agentclientprotocol/sdk";
import {
  InitializeRequestSchema,
  InitializeResponseSchema,
  LoadSessionRequestSchema,
  LoadSessionResponseSchema,
  NewSessionRequestSchema,
  NewSessionResponseSchema,
  RequestPermissionResponseSchema,
  SessionNotificationSchema,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@experiments/protocol-schemas/acp";
import type { AgentBinding, SessionGeneration } from "../sessions/record";
import { FAILED_CONNECTION_CLOSE } from "../ahp/protocol";
import {
  workingDirectoryPath,
  type ConnectAcp,
  type AcpConnectionOptions,
} from "../host-config";
import { withDeadline } from "../deadline";
import { websocketStream } from "./websocket-stream";
import { AgentConversation } from "./conversation";

const CONNECT_TIMEOUT_MS = 30_000;

type AgentUpdates = (
  record: SessionGeneration,
  notification: SessionNotification,
) => void;

class AgentConnections {
  private readonly connect: ConnectAcp;
  private readonly updates: AgentUpdates;
  private readonly sessions: Map<string, Promise<AgentConversation>> =
    new Map();

  constructor({
    connect,
    updates,
  }: {
    connect: ConnectAcp;
    updates: AgentUpdates;
  }) {
    this.connect = connect;
    this.updates = updates;
  }

  async get(record: AgentBinding): Promise<AgentConversation> {
    const cached = this.sessions.get(record.sessionKey);

    if (cached) {
      const agent = await cached;

      if (!agent.closed) {
        return agent;
      }

      if (this.sessions.get(record.sessionKey) === cached) {
        this.sessions.delete(record.sessionKey);
      }
    }

    const pending = this.sessions.get(record.sessionKey) ?? this.open(record);
    this.sessions.set(record.sessionKey, pending);

    try {
      const agent = await pending;

      if (agent.closed) {
        throw new Error("Agent connection closed during setup");
      }

      return agent;
    } catch (error) {
      if (this.sessions.get(record.sessionKey) === pending) {
        this.sessions.delete(record.sessionKey);
      }

      throw error;
    }
  }

  async release(record: SessionGeneration): Promise<void> {
    const pending = this.sessions.get(record.sessionKey);
    this.sessions.delete(record.sessionKey);

    if (!pending) {
      return;
    }

    try {
      const agent = await pending;
      agent.release();
    } catch {}
  }

  private async connectSocket(
    options: AcpConnectionOptions,
  ): Promise<WebSocket> {
    const socket = await this.connect(options);

    if (options.signal.aborted) {
      socket.accept();
      socket.close(FAILED_CONNECTION_CLOSE, "Agent connection timed out");
      options.signal.throwIfAborted();
    }

    return socket;
  }

  private async open(record: AgentBinding): Promise<AgentConversation> {
    const controller = new AbortController();

    const socket = await withDeadline(
      this.connectSocket({
        sessionKey: record.sessionKey,
        signal: controller.signal,
      }),
      CONNECT_TIMEOUT_MS,
      () => {
        controller.abort();
      },
    );

    let loading = true;
    let sessionId = record.acpSession;

    const client: Client = {
      sessionUpdate: async (notification): Promise<void> => {
        if (!loading && notification.sessionId === sessionId) {
          const parsed = SessionNotificationSchema.safeParse(notification);

          if (parsed.success) {
            this.updates(record, parsed.data);
          }
        }
      },
      requestPermission: async (): Promise<RequestPermissionResponse> =>
        RequestPermissionResponseSchema.parse({
          outcome: { outcome: "cancelled" },
        }),
    };

    try {
      const connection = new ClientSideConnection(
        () => client,
        websocketStream(socket),
      );

      socket.accept();

      const initialized = InitializeResponseSchema.parse(
        await withDeadline(
          connection.initialize(
            InitializeRequestSchema.parse({
              protocolVersion: PROTOCOL_VERSION,
              clientCapabilities: {},
            }),
          ),
          CONNECT_TIMEOUT_MS,
          () => {
            socket.close();
          },
        ),
      );

      if (initialized.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error("Unsupported agent protocol version");
      }

      const [directory] = record.session.workingDirectories ?? [];

      if (directory === void 0) {
        throw new Error("Session working directory is missing");
      }

      const options = NewSessionRequestSchema.parse({
        cwd: workingDirectoryPath(directory),
        mcpServers: [],
      });

      if (sessionId === null) {
        const session = NewSessionResponseSchema.parse(
          await withDeadline(
            connection.newSession(options),
            CONNECT_TIMEOUT_MS,
            () => {
              socket.close();
            },
          ),
        );

        ({ sessionId } = session);
      } else {
        if (initialized.agentCapabilities?.loadSession !== true) {
          throw new Error("Agent cannot reopen this conversation");
        }

        LoadSessionResponseSchema.parse(
          await withDeadline(
            connection.loadSession(
              LoadSessionRequestSchema.parse({ ...options, sessionId }),
            ),
            CONNECT_TIMEOUT_MS,
            () => {
              socket.close();
            },
          ),
        );
      }

      loading = false;

      return new AgentConversation({ connection, socket, sessionId });
    } catch (error) {
      socket.close(FAILED_CONNECTION_CLOSE, "Agent setup failed");
      throw error;
    }
  }
}

export { AgentConnections };
