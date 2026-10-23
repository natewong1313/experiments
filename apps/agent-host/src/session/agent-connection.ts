import * as z from "zod";
import {
  client as acpClient,
  methods as acpMethods,
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
  RequestError as ACPRequestError,
} from "@agentclientprotocol/sdk";
import type {
  ClientConnection as ACPClientConnection,
  SessionConfigOption as ACPSessionConfigOption,
  SessionNotification as ACPSessionNotification,
  SessionUpdate as ACPSessionUpdate,
  Stream as ACPStream,
  PromptResponse as ACPPromptResponse,
} from "@agentclientprotocol/sdk";
import { untilAborted } from "../shared/abort";
import { OutputQueue } from "./output-queue";

type OpenOptions = {
  stream(): Promise<ACPStream>;
  cwd: string;
  /**
   * Selects an existing ACP session to load. If null then we start a new session.
   */
  sessionId: string | null;
  /**
   * The model IDs that messages can select. The agent's `model` config option must offer each
   * of them, or the connection fails.
   */
  models: readonly string[];
};

/** The ACP updates that make up the output of a prompt: text, thinking, and tool calls. */
export type TurnUpdate = Extract<
  ACPSessionUpdate,
  {
    sessionUpdate: "agent_message_chunk" | "agent_thought_chunk" | "tool_call" | "tool_call_update";
  }
>;

/**
 * Output of a prompt. A `replay` holds all the output of the prompt so far and replaces the
 * output that the handler has. A `live` update adds new output.
 */
export type PromptOutput =
  | { kind: "replay"; updates: TurnUpdate[] }
  | { kind: "live"; update: TurnUpdate };

type OutputHandler = (output: PromptOutput) => Promise<void>;

type ACPSelectConfigOption = Extract<ACPSessionConfigOption, { type: "select" }>;

const TURN_UPDATES: ReadonlySet<ACPSessionUpdate["sessionUpdate"]> = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
]);

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
  // The session config options of the agent, as of its last response or update.
  configOptions: ACPSessionConfigOption[];
  /**
   * Receives output while a prompt is active. Output outside a prompt, including session/load
   * replay, is ignored.
   */
  output?: OutputQueue<PromptOutput>;
  // True while a prompt with an operation ID waits for the end of its replay.
  replaying?: boolean;
  // The replayed updates so far. Undefined before the first replay update.
  replayed?: TurnUpdate[];
};

/**
 * The `_meta` key of a prompt's operation ID. The agent advertises the key in its capabilities.
 * The sibling in apps/pi-acp/src/operations.ts serves this key.
 */
const OPERATION_ID_META = "agent-host/operationId";

/**
 * The `_meta` key for replay updates of a prompt with an operation ID.
 * Each replay update has a `{ start, end }` value. These fields mark the first and last replay updates.
 * The agent replays all prompt output so far before sending later updates.
 * A new operation replays one empty text chunk.
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

  /**
   * Selects the session model by its value in the agent's `model` config option.
   * If the model is already selected, no request is sent.
   *
   * @throws {ACPRequestError} If the agent has no model option or does not offer `model`.
   */
  async setModel(model: string): Promise<void> {
    const session = this.connected();

    if (!session) {
      throw new Error("Agent is not connected");
    }

    const option = modelOption(session.configOptions);

    if (!option || !optionValues(option).includes(model)) {
      throw ACPRequestError.invalidParams(undefined, `Agent does not offer model ${model}`);
    }

    if (option.currentValue === model) {
      return;
    }

    const response = await session.connection.agent.request(
      acpMethods.agent.session.setConfigOption,
      { sessionId: session.sessionId, configId: option.id, value: model },
    );

    session.configOptions = response.configOptions;
  }

  /** Returns true if the connected agent runs each operation ID once. */
  supportsOperations(): boolean {
    return this.connected()?.supportsOperations === true;
  }

  /**
   * Sends a text prompt and forwards its output until the request settles.
   * For a prompt with an operation ID, the handler first receives a `replay` of all output so
   * far, then each `live` update. Other prompts get only live updates. The handler runs for one
   * output at a time, in order, and the request returns after it ran for all of them.
   * The caller must wait for this request to settle before starting another prompt.
   *
   * @throws {Error} If no connection is available, or if `options` reattaches to an agent that
   * does not support operation IDs.
   */
  async prompt(
    text: string,
    onOutput: OutputHandler,
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

    const output = new OutputQueue(onOutput);
    session.output = output;
    session.replaying = operationId !== undefined && session.supportsOperations;
    let response: ACPPromptResponse;

    try {
      response = await session.connection.agent.request(acpMethods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text }],
        ...(operationId !== undefined &&
          session.supportsOperations && { _meta: { [OPERATION_ID_META]: operationId } }),
      });
    } catch (error) {
      await output.drain().catch(() => null);
      throw error;
    } finally {
      session.output = undefined;
      session.replaying = undefined;
      session.replayed = undefined;
    }

    // The agent sends the output of a prompt before its response, so the queue has all of it.
    await output.drain();

    return response;
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
      .onNotification(acpMethods.client.session.update, ({ params }) => {
        this.receive(opened, params);
      })
      .connect(stream);

    function abort(): void {
      connection.close();
    }

    signal.addEventListener("abort", abort);

    try {
      signal.throwIfAborted();
      const initialized = await this.initialize(connection, options);
      requireModels(initialized.configOptions, options.models);
      signal.throwIfAborted();
      opened = { connection, ...initialized };
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
  ): Promise<Pick<ConnectedSession, "sessionId" | "supportsOperations" | "configOptions">> {
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

      return {
        sessionId: created.sessionId,
        supportsOperations,
        configOptions: created.configOptions ?? [],
      };
    }

    if (initialized.agentCapabilities?.loadSession !== true) {
      throw new Error("Agent does not support loading a persisted session");
    }

    const loaded = await connection.agent.request(acpMethods.agent.session.load, {
      sessionId: options.sessionId,
      cwd: options.cwd,
      mcpServers: [],
    });

    return {
      sessionId: options.sessionId,
      supportsOperations,
      configOptions: loaded.configOptions ?? [],
    };
  }

  /**
   * Stores session config updates and forwards output to the active prompt handler.
   * The handler receives no output before initialization or outside a prompt.
   * For operation-ID prompts, output before the replay is ignored because the replay includes it.
   * The replay updates form one replay. The connection handles notifications concurrently, so
   * this method only queues the output, in the order that the notifications arrive.
   */
  private receive(
    session: ConnectedSession | undefined,
    notification: ACPSessionNotification,
  ): void {
    const { update } = notification;

    if (!session || notification.sessionId !== session.sessionId) {
      return;
    }

    if (update.sessionUpdate === "config_option_update") {
      session.configOptions = update.configOptions;

      return;
    }

    if (!session.output || !isTurnUpdate(update)) {
      return;
    }

    if (session.replaying !== true) {
      session.output.push({ kind: "live", update });

      return;
    }

    const marker = ReplayMarkerSchema.safeParse(update._meta?.[REPLAY_META]).data;

    if (marker?.start === true) {
      session.replayed = [];
    }

    if (!marker || !session.replayed) {
      return;
    }

    session.replayed.push(update);

    if (!marker.end) {
      return;
    }

    const updates = session.replayed;
    session.replaying = false;
    session.replayed = undefined;
    session.output.push({ kind: "replay", updates });
  }
}

/** Returns the select config option of the agent with category `model`, if it has one. */
function modelOption(
  configOptions: readonly ACPSessionConfigOption[],
): ACPSelectConfigOption | undefined {
  return configOptions.find(
    (option): option is ACPSelectConfigOption =>
      option.category === "model" && option.type === "select",
  );
}

/**
 * Checks that the agent offers each model that messages can select. A host and an agent with
 * different model lists would fail every turn that selects a missing model.
 *
 * @throws {ACPRequestError} If the agent does not offer one of `models`.
 */
function requireModels(
  configOptions: readonly ACPSessionConfigOption[],
  models: readonly string[],
): void {
  const option = modelOption(configOptions);
  const offered = new Set(option ? optionValues(option) : []);
  const missing = models.filter((model) => !offered.has(model));

  if (missing.length > 0) {
    throw ACPRequestError.invalidParams(
      undefined,
      `Agent does not offer models ${missing.join(", ")} that the agent info lists`,
    );
  }
}

function isTurnUpdate(update: ACPSessionUpdate): update is TurnUpdate {
  return TURN_UPDATES.has(update.sessionUpdate);
}

/** Returns the values of a select config option, also from its groups. */
function optionValues(option: ACPSelectConfigOption): string[] {
  return option.options.flatMap((entry) =>
    "group" in entry ? entry.options.map((grouped) => grouped.value) : [entry.value],
  );
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
