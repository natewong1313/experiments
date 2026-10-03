import { client, methods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import {
  InitializeRequestOutboundSchema,
  InitializeResponseSchema,
  LoadSessionRequestOutboundSchema,
  LoadSessionResponseSchema,
  NewSessionRequestOutboundSchema,
  NewSessionResponseSchema,
  RequestPermissionResponseOutboundSchema,
  SessionNotificationSchema,
  type RequestPermissionResponse,
} from "@experiments/protocol-schemas/acp";
import type { AgentBinding, SessionGeneration } from "../sessions/record";
import { FAILED_CONNECTION_CLOSE } from "../ahp/protocol";
import { workingDirectoryPath, type ConnectAcp, type AcpConnectionOptions } from "../host-config";
import { withDeadline } from "../deadline";
import { websocketStream } from "./websocket-stream";
import { AgentConversation } from "./conversation";
import { SessionUpdates, type AgentUpdates } from "./updates";
import { AGENT_IDLE_TIMEOUT_MS, MAX_AGENT_CONNECTIONS, MemoryLimitError } from "../memory";

const CONNECT_TIMEOUT_MS = 30_000;

type ConnectionEntry = {
  pending: Promise<AgentConversation>;
  idleTimer: ReturnType<typeof setTimeout> | null;
  use: number;
};

type AgentConnectionsParams = {
  connect: ConnectAcp;
  updates: AgentUpdates;
};

class AgentConnections {
  private readonly connect: ConnectAcp;
  private readonly updates: AgentUpdates;
  private readonly sessions: Map<string, ConnectionEntry> = new Map();

  constructor({ connect, updates }: AgentConnectionsParams) {
    this.connect = connect;
    this.updates = updates;
  }

  async get(record: AgentBinding): Promise<AgentConversation> {
    const cached = this.sessions.get(record.sessionKey);

    if (cached) {
      cached.use += 1;
      this.clearIdle(cached);
      const agent = await cached.pending;

      if (!agent.closed) {
        return agent;
      }

      if (this.sessions.get(record.sessionKey) === cached) {
        this.sessions.delete(record.sessionKey);
      }
    }

    let entry = this.sessions.get(record.sessionKey);

    if (!entry) {
      if (this.sessions.size >= MAX_AGENT_CONNECTIONS) {
        throw new MemoryLimitError(
          "Agent connection capacity reached; retry after an idle session closes",
        );
      }

      const binding: AgentBinding = {
        uri: record.uri,
        sessionKey: record.sessionKey,
        acpSession: record.acpSession,
        session: { workingDirectories: record.session.workingDirectories },
      };

      const opened: ConnectionEntry = {
        pending: this.open(binding, () => {
          this.remove(binding.sessionKey, opened);
        }),
        idleTimer: null,
        use: 0,
      };

      entry = opened;
      this.sessions.set(record.sessionKey, entry);
    }

    try {
      const agent = await entry.pending;

      if (agent.closed) {
        throw new Error("Agent connection closed during setup");
      }

      return agent;
    } catch (error) {
      this.remove(record.sessionKey, entry);

      throw error;
    }
  }

  async release(record: SessionGeneration): Promise<void> {
    const entry = this.sessions.get(record.sessionKey);

    if (!entry) {
      return;
    }

    this.remove(record.sessionKey, entry);

    try {
      const agent = await entry.pending;
      agent.release();
    } catch {}
  }

  async idle(record: SessionGeneration): Promise<void> {
    const entry = this.sessions.get(record.sessionKey);

    if (!entry) {
      return;
    }

    const { use } = entry;

    try {
      const agent = await entry.pending;

      if (
        this.sessions.get(record.sessionKey) === entry &&
        entry.use === use &&
        agent.canReload &&
        !agent.closed
      ) {
        this.clearIdle(entry);
        entry.idleTimer = setTimeout(() => {
          this.remove(record.sessionKey, entry);
          agent.release();
        }, AGENT_IDLE_TIMEOUT_MS);
      }
    } catch {}
  }

  private clearIdle(entry: ConnectionEntry): void {
    if (entry.idleTimer !== null) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
  }

  private remove(key: string, entry: ConnectionEntry): void {
    this.clearIdle(entry);

    if (this.sessions.get(key) === entry) {
      this.sessions.delete(key);
    }
  }

  private async connectSocket(options: AcpConnectionOptions): Promise<WebSocket> {
    const socket = await this.connect(options);

    if (options.signal.aborted) {
      socket.accept();
      socket.close(FAILED_CONNECTION_CLOSE, "Agent connection timed out");
      options.signal.throwIfAborted();
    }

    return socket;
  }

  private async open(record: AgentBinding, onClose: () => void): Promise<AgentConversation> {
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

    let sessionId = record.acpSession;

    const updates = new SessionUpdates(record, sessionId, this.updates);

    const app = client({ name: "agent-host" })
      .onNotification(methods.client.session.update, SessionNotificationSchema, ({ params }) => {
        try {
          updates.receive(params);
        } catch (error) {
          socket.close(FAILED_CONNECTION_CLOSE, "Invalid agent update");
          throw error;
        }
      })
      .onRequest(methods.client.session.requestPermission, (): RequestPermissionResponse =>
        RequestPermissionResponseOutboundSchema.parse({ outcome: { outcome: "cancelled" } }),
      );

    try {
      const connection = app.connect(websocketStream(socket));

      connection.signal.addEventListener("abort", onClose, { once: true });

      socket.accept();

      console.log("Initializing", record.acpSession);

      const initialized = InitializeResponseSchema.parse(
        await withDeadline(
          connection.agent.request(
            methods.agent.initialize,
            InitializeRequestOutboundSchema.parse({
              protocolVersion: PROTOCOL_VERSION,
              clientCapabilities: {
                session: { compaction: {}, notices: {}, configOptions: { boolean: {} } },
                subagents: {},
                plan: {},
              },
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

      const options = NewSessionRequestOutboundSchema.parse({
        cwd: workingDirectoryPath(directory),
        mcpServers: [],
      });

      if (sessionId === null) {
        console.log("new session", record.acpSession);

        const session = NewSessionResponseSchema.parse(
          await withDeadline(
            connection.agent.request(methods.agent.session.new, options),
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

        console.log("loading session", record.acpSession);

        LoadSessionResponseSchema.parse(
          await withDeadline(
            connection.agent.request(
              methods.agent.session.load,
              LoadSessionRequestOutboundSchema.parse({ ...options, sessionId }),
            ),
            CONNECT_TIMEOUT_MS,
            () => {
              socket.close();
            },
          ),
        );
      }

      return new AgentConversation({
        connection,
        socket,
        sessionId,
        canReload: initialized.agentCapabilities?.loadSession === true,
        activate: (): void => {
          if (sessionId !== null) {
            updates.activate(sessionId);
          }
        },
      });
    } catch (error) {
      socket.close(FAILED_CONNECTION_CLOSE, "Agent setup failed");
      throw error;
    }
  }
}

export { AgentConnections };
