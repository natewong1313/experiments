import { client, methods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type {
  ClientConnection,
  SessionNotification,
  Stream,
  PromptResponse,
} from "@agentclientprotocol/sdk";
import type { SessionRepository } from "../db/repositories/session";
import type { SessionRecord } from "../db/schema";

export type AgentTextUpdate = { sessionId: string; text: string };

type ConnectionOptions = {
  stream: Stream;
  cwd: string;
  sessionId: string | null;
};

type AgentOptions = {
  repository: SessionRepository;
  getSession(): Promise<SessionRecord>;
  isDisposed(): boolean;
  workingDirectory(): string;
  connectAgent(sessionId: string): Promise<Stream>;
  update(notification: AgentTextUpdate): Promise<void>;
};

type PromptOptions = {
  turnId: string;
  text: string;
  startResponse(): Promise<void>;
};

export class SessionAgent {
  private connection?: ClientConnection;
  private connecting?: Promise<ClientConnection>;
  private loading = false;

  private readonly options: AgentOptions;

  constructor(options: AgentOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    await this.getConnection();
  }

  async prompt(options: PromptOptions): Promise<PromptResponse | undefined> {
    const connection = await this.getConnection();
    const record = await this.options.getSession();

    if (record.chatState.activeTurn?.id !== options.turnId || record.acpSessionId === null) {
      return undefined;
    }

    await options.startResponse();

    return await connection.agent.request(methods.agent.session.prompt, {
      sessionId: record.acpSessionId,
      prompt: [{ type: "text", text: options.text }],
    });
  }

  async cancel(sessionId: string): Promise<void> {
    await this.connection?.agent.notify(methods.agent.session.cancel, { sessionId });
  }

  async cancelForDisposal(sessionId: string): Promise<void> {
    if (this.connection && !this.connection.signal.aborted) {
      await this.cancel(sessionId);
    }
  }

  close(): void {
    this.connection?.close();
  }

  private async getConnection(): Promise<ClientConnection> {
    if (this.connection && !this.connection.signal.aborted) {
      return this.connection;
    }

    if (this.connecting) {
      return await this.connecting;
    }

    this.connecting = this.openConnection();

    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async openConnection(): Promise<ClientConnection> {
    const record = await this.options.getSession();
    const directory = record.sessionState.workingDirectories?.[0];

    const cwd =
      directory === undefined
        ? this.options.workingDirectory()
        : decodeURIComponent(new URL(directory).pathname);

    this.loading = true;

    try {
      const stream = await this.options.connectAgent(record.id);

      const opened = await this.initializeConnection({
        stream,
        cwd,
        sessionId: record.acpSessionId,
      });

      if (this.options.isDisposed()) {
        opened.connection.close();
        throw new Error("Session was disposed during agent initialization");
      }

      const current = await this.options.getSession();
      current.acpSessionId = opened.sessionId;
      await this.options.repository.save(current);
      this.connection = opened.connection;

      return opened.connection;
    } finally {
      this.loading = false;
    }
  }

  private async initializeConnection(
    options: ConnectionOptions,
  ): Promise<{ connection: ClientConnection; sessionId: string }> {
    const connection = client({ name: "agent-host" })
      .onNotification(methods.client.session.update, ({ params }) => this.update(params))
      .connect(options.stream);

    try {
      const initialized = await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });

      if (options.sessionId !== null) {
        if (initialized.agentCapabilities?.loadSession !== true) {
          throw new Error("Agent does not support loading a persisted session");
        }

        await connection.agent.request(methods.agent.session.load, {
          sessionId: options.sessionId,
          cwd: options.cwd,
          mcpServers: [],
        });

        return { connection, sessionId: options.sessionId };
      }

      const created = await connection.agent.request(methods.agent.session.new, {
        cwd: options.cwd,
        mcpServers: [],
      });

      return { connection, sessionId: created.sessionId };
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  private async update(notification: SessionNotification): Promise<void> {
    if (this.loading || this.options.isDisposed()) {
      return;
    }

    const { update } = notification;

    if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
      await this.options.update({ sessionId: notification.sessionId, text: update.content.text });
    }
  }
}
