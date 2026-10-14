import { client, methods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type {
  ClientConnection,
  SessionNotification,
  Stream,
  PromptResponse,
} from "@agentclientprotocol/sdk";

type OpenOptions = {
  stream(): Promise<Stream>;
  cwd: string;
  // Loads this ACP session when set, otherwise starts a new one.
  sessionId: string | null;
};

type TextHandler = (text: string) => Promise<void>;

type AgentSession = {
  connection: ClientConnection;
  sessionId: string;
  // Set while a prompt is in flight. Text outside a prompt, such as session/load replay, is dropped.
  onText?: TextHandler;
};

export class AgentConnection {
  private current?: AgentSession;
  private opening?: Promise<AgentSession>;
  private closing = new AbortController();

  async open(options: OpenOptions): Promise<string> {
    const live = this.live();

    if (live) {
      return live.sessionId;
    }

    const { signal } = this.closing;
    const opening = this.opening ?? this.connect(options, signal);
    this.opening = opening;

    try {
      const opened = await opening;
      signal.throwIfAborted();

      return opened.sessionId;
    } finally {
      if (this.opening === opening) {
        this.opening = undefined;
      }
    }
  }

  // The caller runs one prompt at a time.
  async prompt(text: string, onText: TextHandler): Promise<PromptResponse> {
    const live = this.live();

    if (!live) {
      throw new Error("Agent is not connected");
    }

    live.onText = onText;

    try {
      return await live.connection.agent.request(methods.agent.session.prompt, {
        sessionId: live.sessionId,
        prompt: [{ type: "text", text }],
      });
    } finally {
      live.onText = undefined;
    }
  }

  async cancel(): Promise<void> {
    const live = this.live();

    if (live) {
      await live.connection.agent.notify(methods.agent.session.cancel, {
        sessionId: live.sessionId,
      });
    }
  }

  // Closes the live connection and fails any open in flight.
  close(): void {
    this.closing.abort(new Error("Agent connection was closed"));
    this.closing = new AbortController();
    this.opening = undefined;
    this.current?.connection.close();
    this.current = undefined;
  }

  private live(): AgentSession | undefined {
    return this.current && !this.current.connection.signal.aborted ? this.current : undefined;
  }

  private async connect(options: OpenOptions, signal: AbortSignal): Promise<AgentSession> {
    const stream = await options.stream();
    let opened: AgentSession | undefined;

    const connection = client({ name: "agent-host" })
      .onNotification(methods.client.session.update, async ({ params }) => {
        await this.receive(opened, params);
      })
      .connect(stream);

    function abort(): void {
      connection.close();
    }

    signal.addEventListener("abort", abort);

    try {
      signal.throwIfAborted();
      const sessionId = await this.initialize(connection, options);
      signal.throwIfAborted();
      opened = { connection, sessionId };
      this.current = opened;

      return opened;
    } catch (error) {
      connection.close();
      signal.throwIfAborted();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  private async initialize(connection: ClientConnection, options: OpenOptions): Promise<string> {
    const initialized = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    if (options.sessionId === null) {
      const created = await connection.agent.request(methods.agent.session.new, {
        cwd: options.cwd,
        mcpServers: [],
      });

      return created.sessionId;
    }

    if (initialized.agentCapabilities?.loadSession !== true) {
      throw new Error("Agent does not support loading a persisted session");
    }

    await connection.agent.request(methods.agent.session.load, {
      sessionId: options.sessionId,
      cwd: options.cwd,
      mcpServers: [],
    });

    return options.sessionId;
  }

  private async receive(
    session: AgentSession | undefined,
    notification: SessionNotification,
  ): Promise<void> {
    const { update } = notification;

    if (
      session?.onText &&
      notification.sessionId === session.sessionId &&
      update.sessionUpdate === "agent_message_chunk" &&
      update.content.type === "text"
    ) {
      await session.onText(update.content.text);
    }
  }
}
