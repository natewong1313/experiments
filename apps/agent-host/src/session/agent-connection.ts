import * as z from "zod";
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
import { untilAborted } from "../shared/abort";

type OpenOptions = {
  stream(): Promise<ACPStream>;
  cwd: string;
  /**
   * Selects an existing ACP session to load. If null then we start a new session.
   */
  sessionId: string | null;
};

/**
 * Text of a prompt. A `snapshot` holds all the text of the prompt so far and replaces the text
 * that the handler has. A `delta` continues the text.
 */
export type PromptText = { kind: "snapshot" | "delta"; text: string };

type TextHandler = (text: PromptText) => Promise<void>;

type PromptOptions = {
  /**
   * Identifies the prompt at the agent. An agent that supports operation IDs runs a prompt with
   * a known ID once, and a repeated prompt reattaches to it.
   */
  operationId?: string;
  /**
   * Reattaches to the prompt with `operationId`. Requires an agent that supports operation IDs.
   */
  reattach?: boolean;
};

type ConnectedSession = {
  connection: ACPClientConnection;
  sessionId: string;
  // True if the agent runs each operation ID once.
  supportsOperations: boolean;
  /**
   * Receives text while a prompt is active. Text outside a prompt, including session/load replay, is ignored.
   */
  onText?: TextHandler;
  // True while a prompt with an operation ID waits for the end of its replay.
  replaying?: boolean;
  // The replayed text so far. Undefined before the first replay chunk.
  replayed?: string;
};

/**
 * The `_meta` key of a prompt's operation ID. The agent advertises the key in its capabilities.
 * The sibling in apps/pi-acp/src/operations.ts serves this key.
 */
const OPERATION_ID_META = "agent-host/operationId";

/**
 * The `_meta` key of the chunks that replay all the text of a prompt with an operation ID so
 * far. Its value is `{ start, end }`, which marks the first and the last chunk of the replay.
 * The agent replays every such prompt before its other updates, with one empty chunk for a new
 * operation.
 */
const REPLAY_META = "agent-host/replay";

const ReplayMarkerSchema = z.object({ start: z.boolean(), end: z.boolean() });

/**
 * Maintains one ACP session connection and forwards text updates to the active prompt's handler.
 * The caller must run one prompt at a time.
 */
export class AgentConnection {
  private current?: ConnectedSession;
  private opening?: Promise<ConnectedSession>;
  private closing = new AbortController();

  /**
   * Returns the connected session ID or opens a connection and creates or loads an ACP session.
   * Concurrent calls share the pending connection attempt and its options.
   * If close is called during the attempt, the pending calls fail.
   */
  async open(options: OpenOptions): Promise<string> {
    const session = this.connected();

    if (session) {
      return session.sessionId;
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

  /** Returns true if the connected agent runs each operation ID once. */
  supportsOperations(): boolean {
    return this.connected()?.supportsOperations === true;
  }

  /**
   * Sends a text prompt and forwards its text updates until the request settles. A prompt with
   * an operation ID first gets a `snapshot` of all its text so far, then `delta` text. Other
   * prompts get only `delta` text.
   * The caller must wait for this request to settle before starting another prompt.
   *
   * @throws {Error} If no connection is available, or if `options` reattaches to an agent that
   * does not support operation IDs.
   */
  async prompt(
    text: string,
    onText: TextHandler,
    options: PromptOptions = {},
  ): Promise<ACPPromptResponse> {
    const session = this.connected();

    if (!session) {
      throw new Error("Agent is not connected");
    }

    const { operationId, reattach = false } = options;

    if (reattach && (operationId === undefined || !session.supportsOperations)) {
      throw new Error("Agent cannot reattach to a prompt");
    }

    session.onText = onText;
    session.replaying = operationId !== undefined && session.supportsOperations;

    try {
      return await session.connection.agent.request(acpMethods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text }],
        ...(operationId !== undefined &&
          session.supportsOperations && { _meta: { [OPERATION_ID_META]: operationId } }),
      });
    } finally {
      session.onText = undefined;
      session.replaying = undefined;
      session.replayed = undefined;
    }
  }

  /**
   * Sends a cancellation notification if a connection exists.
   * This method does not wait for the active prompt to finish.
   */
  async cancel(): Promise<void> {
    const session = this.connected();

    if (session) {
      await session.connection.agent.notify(acpMethods.agent.session.cancel, {
        sessionId: session.sessionId,
      });
    }
  }

  /**
   * Sends a cancellation notification, then closes the connection. Returns without a close if
   * another `close` call runs first since a later `open` call can own the new connection.
   */
  async stop(): Promise<void> {
    const { signal } = this.closing;

    try {
      await untilAborted(this.cancel(), signal);
    } catch {
      // Closing the connection stops the prompt.
    } finally {
      if (!signal.aborted) {
        this.close();
      }
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
  private connected(): ConnectedSession | undefined {
    return this.current && !this.current.connection.signal.aborted ? this.current : undefined;
  }

  /**
   * Opens the stream and initializes the ACP session before making the connection available to callers.
   * Initialization failure or cancellation closes the connection.
   */
  private async connect(options: OpenOptions, signal: AbortSignal): Promise<ConnectedSession> {
    const stream = await openStream(options, signal);
    let opened: ConnectedSession | undefined;

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
      const { sessionId, supportsOperations } = await this.initialize(connection, options);
      signal.throwIfAborted();
      opened = { connection, sessionId, supportsOperations };
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
  private async initialize(
    connection: ACPClientConnection,
    options: OpenOptions,
  ): Promise<{ sessionId: string; supportsOperations: boolean }> {
    const initialized = await connection.agent.request(acpMethods.agent.initialize, {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    const supportsOperations = initialized.agentCapabilities?._meta?.[OPERATION_ID_META] === true;

    if (options.sessionId === null) {
      const created = await connection.agent.request(acpMethods.agent.session.new, {
        cwd: options.cwd,
        mcpServers: [],
      });

      return { sessionId: created.sessionId, supportsOperations };
    }

    if (initialized.agentCapabilities?.loadSession !== true) {
      throw new Error("Agent does not support loading a persisted session");
    }

    await connection.agent.request(acpMethods.agent.session.load, {
      sessionId: options.sessionId,
      cwd: options.cwd,
      mcpServers: [],
    });

    return { sessionId: options.sessionId, supportsOperations };
  }

  /**
   * Forwards text chunks only when they match the session with an active prompt handler.
   * Updates received before initialization or outside a prompt are ignored. A prompt with an
   * operation ID ignores the chunks before its replay, which repeats their text, and joins the
   * replay chunks into one snapshot.
   */
  private async receive(
    session: ConnectedSession | undefined,
    notification: ACPSessionNotification,
  ): Promise<void> {
    const { update } = notification;

    if (
      !session?.onText ||
      notification.sessionId !== session.sessionId ||
      update.sessionUpdate !== "agent_message_chunk" ||
      update.content.type !== "text"
    ) {
      return;
    }

    const { text } = update.content;

    if (session.replaying !== true) {
      await session.onText({ kind: "delta", text });

      return;
    }

    const marker = ReplayMarkerSchema.safeParse(update._meta?.[REPLAY_META]).data;

    if (marker?.start === true) {
      session.replayed = "";
    }

    if (!marker || session.replayed === undefined) {
      return;
    }

    session.replayed += text;

    if (!marker.end) {
      return;
    }

    const snapshot = session.replayed;
    session.replaying = false;
    session.replayed = undefined;
    await session.onText({ kind: "snapshot", text: snapshot });
  }
}

/**
 * Opens the stream, or rejects when `signal` aborts first. A stream that opens after the abort
 * has no connection that can close it, so this function closes it.
 */
async function openStream(options: OpenOptions, signal: AbortSignal): Promise<ACPStream> {
  signal.throwIfAborted();
  const opening = options.stream();

  try {
    return await untilAborted(opening, signal);
  } catch (error) {
    if (signal.aborted) {
      void closeLateStream(opening);
    }

    throw error;
  }
}

/** Closes the stream of a connection attempt that stopped before the stream opened. */
async function closeLateStream(opening: Promise<ACPStream>): Promise<void> {
  try {
    const stream = await opening;
    await Promise.allSettled([stream.readable.cancel(), stream.writable.abort()]);
  } catch {
    // The stream did not open, so nothing remains to close.
  }
}
