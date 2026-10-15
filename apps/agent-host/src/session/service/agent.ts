import {
  client as acpClient,
  methods as acpMethods,
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import type {
  ClientConnection as ACPClientConnection,
  SessionNotification as ACPSessionNotification,
  Stream as ACPStream,
  PromptResponse as ACPPromptResponse,
} from "@agentclientprotocol/sdk";

type OpenOptions = {
  stream(): Promise<ACPStream>;
  cwd: string;
  /**
   * Selects an existing ACP session to load. If null then we start a new session.
   */
  sessionId: string | null;
};

type TextHandler = (text: string) => Promise<void>;

type AgentSession = {
  connection: ACPClientConnection;
  sessionId: string;
  /**
   * Receives text while a prompt is active. Text outside a prompt, including session/load replay, is ignored.
   */
  onText?: TextHandler;
};

/**
 * Maintains one ACP session connection and forwards text updates to the active prompt's handler.
 * The caller must run one prompt at a time.
 */
export class AgentConnection {
  private current?: AgentSession;
  private opening?: Promise<AgentSession>;
  private closing = new AbortController();

  /**
   * Returns the live session ID or opens a connection and creates or loads an ACP session.
   * Concurrent calls share the pending connection attempt and its options.
   * If close is called during the attempt, the pending calls fail.
   */
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

  /**
   * Sends a text prompt and forwards its text updates until the request settles.
   * The caller must wait for this request to settle before starting another prompt.
   *
   * @throws {Error} If no live connection is available.
   */
  async prompt(text: string, onText: TextHandler): Promise<ACPPromptResponse> {
    const live = this.live();

    if (!live) {
      throw new Error("Agent is not connected");
    }

    live.onText = onText;

    try {
      return await live.connection.agent.request(acpMethods.agent.session.prompt, {
        sessionId: live.sessionId,
        prompt: [{ type: "text", text }],
      });
    } finally {
      live.onText = undefined;
    }
  }

  /**
   * Sends a cancellation notification if a live connection exists.
   * This method does not wait for the active prompt to finish.
   */
  async cancel(): Promise<void> {
    const live = this.live();

    if (live) {
      await live.connection.agent.notify(acpMethods.agent.session.cancel, {
        sessionId: live.sessionId,
      });
    }
  }

  /**
   * Closes the current connection and invalidates pending connection attempts.
   */
  close(): void {
    this.closing.abort(new Error("Agent connection was closed"));
    this.closing = new AbortController();
    this.opening = undefined;
    this.current?.connection.close();
    this.current = undefined;
  }

  /**
   * Excludes connections whose abort signal indicates that they have closed.
   */
  private live(): AgentSession | undefined {
    return this.current && !this.current.connection.signal.aborted ? this.current : undefined;
  }

  /**
   * Opens the stream and initializes the ACP session before making the connection available to callers.
   * Initialization failure or cancellation closes the connection.
   */
  private async connect(options: OpenOptions, signal: AbortSignal): Promise<AgentSession> {
    const stream = await options.stream();
    let opened: AgentSession | undefined;

    const connection = acpClient({ name: "agent-host" })
      .onNotification(acpMethods.client.session.update, async ({ params }) => {
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

  /**
   * Initializes ACP with no client capabilities, then creates or loads a session without MCP servers.
   *
   * @throws {Error} If an existing session is requested but the agent does not support loading sessions.
   */
  private async initialize(connection: ACPClientConnection, options: OpenOptions): Promise<string> {
    const initialized = await connection.agent.request(acpMethods.agent.initialize, {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    if (options.sessionId === null) {
      const created = await connection.agent.request(acpMethods.agent.session.new, {
        cwd: options.cwd,
        mcpServers: [],
      });

      return created.sessionId;
    }

    if (initialized.agentCapabilities?.loadSession !== true) {
      throw new Error("Agent does not support loading a persisted session");
    }

    await connection.agent.request(acpMethods.agent.session.load, {
      sessionId: options.sessionId,
      cwd: options.cwd,
      mcpServers: [],
    });

    return options.sessionId;
  }

  /**
   * Forwards text chunks only when they match the session with an active prompt handler.
   * Updates received before initialization or outside a prompt are ignored.
   */
  private async receive(
    session: AgentSession | undefined,
    notification: ACPSessionNotification,
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
