import {
  client,
  methods,
  PROTOCOL_VERSION,
  type ClientConnection,
  type Stream,
} from "@agentclientprotocol/sdk";
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
  type InitializeResponse,
} from "@experiments/protocol-schemas/acp";
import type { AgentBinding, SessionGeneration } from "../sessions/record";
import { workingDirectoryPath, type ConnectAcp, type AcpConnectionOptions } from "../host-config";
import { withDeadline } from "../deadline";
import { AgentConversation } from "./conversation";
import { SessionUpdates, type AgentUpdates } from "./updates";
import { AGENT_IDLE_TIMEOUT_MS, MAX_AGENT_CONNECTIONS, MemoryLimitError } from "../memory";

const CONNECT_TIMEOUT_MS = 30_000;

type ConnectionEntry = {
  conversation: Promise<AgentConversation>;
  idleTimer: ReturnType<typeof setTimeout> | null;
  useVersion: number;
};

type AgentConnectionsParams = {
  connect: ConnectAcp;
  updates: AgentUpdates;
};

type OpenSessionParams = {
  connection: ClientConnection;
  record: AgentBinding;
  canReload: boolean;
};

/**
 * Manages agent connections across all sessions on a host
 */
export class AgentConnections {
  private connect: ConnectAcp;
  private updates: AgentUpdates;
  private sessions: Map<string, ConnectionEntry> = new Map();

  // TODO: make not params
  constructor({ connect, updates }: AgentConnectionsParams) {
    this.connect = connect;
    this.updates = updates;
  }

  /**
   * Returns a AgentConversation instance for a given session.
   */
  async get(record: AgentBinding): Promise<AgentConversation> {
    let entry = this.sessions.get(record.sessionKey);

    try {
      if (entry) {
        entry.useVersion += 1;
        this.clearIdle(entry);
        const agent = await entry.conversation;

        if (!agent.closed) {
          return agent;
        }

        this.remove(record.sessionKey, entry);
      }

      entry = this.sessions.get(record.sessionKey) ?? this.openEntry(record);
      const agent = await entry.conversation;

      if (agent.closed) {
        throw new Error("Agent connection closed during setup");
      }

      return agent;
    } catch (error) {
      if (entry) {
        this.remove(record.sessionKey, entry);
      }

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
      const agent = await entry.conversation;
      agent.release();
    } catch {}
  }

  async idle(record: SessionGeneration): Promise<void> {
    const entry = this.sessions.get(record.sessionKey);

    if (!entry) {
      return;
    }

    const { useVersion } = entry;

    try {
      const agent = await entry.conversation;

      if (
        this.sessions.get(record.sessionKey) === entry &&
        entry.useVersion === useVersion &&
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

  private openEntry(record: AgentBinding): ConnectionEntry {
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

    const entry: ConnectionEntry = {
      conversation: this.open(binding, () => {
        this.remove(binding.sessionKey, entry);
      }),
      idleTimer: null,
      useVersion: 0,
    };

    this.sessions.set(record.sessionKey, entry);

    return entry;
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

  private async connectStream(options: AcpConnectionOptions): Promise<Stream> {
    const stream = await this.connect(options);

    if (options.signal.aborted) {
      await Promise.allSettled([
        stream.readable.cancel(options.signal.reason),
        stream.writable.abort(options.signal.reason),
      ]);
      options.signal.throwIfAborted();
    }

    return stream;
  }

  private async openStream(sessionKey: string): Promise<Stream> {
    const controller = new AbortController();

    return withDeadline(
      this.connectStream({ sessionKey, signal: controller.signal }),
      CONNECT_TIMEOUT_MS,
      () => {
        controller.abort();
      },
    );
  }

  private async open(record: AgentBinding, onClose: () => void): Promise<AgentConversation> {
    const stream = await this.openStream(record.sessionKey);
    const updates = new SessionUpdates(record, record.acpSession, this.updates);
    const connection = this.createConnection(stream, updates, onClose);

    try {
      console.log("Initializing", record.acpSession);

      const initialized = await this.initializeAgent(connection);
      const canReload = initialized.agentCapabilities?.loadSession === true;
      const sessionId = await this.openSession({ connection, record, canReload });

      return new AgentConversation({
        connection,
        sessionId,
        canReload,
        activate: (): void => {
          updates.activate(sessionId);
        },
      });
    } catch (error) {
      connection.close(error);
      throw error;
    }
  }

  private createConnection(
    stream: Stream,
    updates: SessionUpdates,
    onClose: () => void,
  ): ClientConnection {
    const app = client({ name: "agent-host" })
      .onNotification(methods.client.session.update, SessionNotificationSchema, ({ params }) => {
        try {
          updates.receive(params);
        } catch (error) {
          connection.close(error);
          throw error;
        }
      })
      .onRequest(methods.client.session.requestPermission, (): RequestPermissionResponse =>
        RequestPermissionResponseOutboundSchema.parse({ outcome: { outcome: "cancelled" } }),
      );

    const connection = app.connect(stream);
    connection.signal.addEventListener(
      "abort",
      () => {
        onClose();
      },
      { once: true },
    );

    return connection;
  }

  private async initializeAgent(connection: ClientConnection): Promise<InitializeResponse> {
    const params = InitializeRequestOutboundSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        session: { compaction: {}, notices: {}, configOptions: { boolean: {} } },
        subagents: {},
        plan: {},
      },
    });

    const request = connection.agent.request(methods.agent.initialize, params);

    const result = await withDeadline(request, CONNECT_TIMEOUT_MS, () => {
      connection.close(new Error("Agent operation timed out"));
    });

    const initialized = InitializeResponseSchema.parse(result);

    if (initialized.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error("Unsupported agent protocol version");
    }

    return initialized;
  }

  private async openSession({ connection, record, canReload }: OpenSessionParams): Promise<string> {
    const [directory] = record.session.workingDirectories ?? [];

    if (directory === void 0) {
      throw new Error("Session working directory is missing");
    }

    const options = NewSessionRequestOutboundSchema.parse({
      cwd: workingDirectoryPath(directory),
      mcpServers: [],
    });

    const sessionId = record.acpSession;

    if (sessionId === null) {
      console.log("new session", record.acpSession);

      const request = connection.agent.request(methods.agent.session.new, options);

      const result = await withDeadline(request, CONNECT_TIMEOUT_MS, () => {
        connection.close(new Error("Agent operation timed out"));
      });

      return NewSessionResponseSchema.parse(result).sessionId;
    }

    if (!canReload) {
      throw new Error("Agent cannot reopen this conversation");
    }

    console.log("loading session", record.acpSession);

    const params = LoadSessionRequestOutboundSchema.parse({ ...options, sessionId });
    const request = connection.agent.request(methods.agent.session.load, params);

    const result = await withDeadline(request, CONNECT_TIMEOUT_MS, () => {
      connection.close(new Error("Agent operation timed out"));
    });

    LoadSessionResponseSchema.parse(result);

    return sessionId;
  }
}
