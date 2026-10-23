import {
  agent as acpAgent,
  methods,
  type AgentConnection,
  type AgentContext,
  type CancelNotification,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SessionUpdate,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import type { AgentEventStream } from "@earendil-works/pi-durable";
import type { PiHarness, PiSession } from "agents/harness/pi";
import { AcpSessionEventsWatcher } from "./acp-session-watch";
import { textChunks } from "./frame-limits";
import { MODEL_CONFIG_ID, modelConfigOptions, modelOf } from "./model-option";
import type { AcpModel, SessionModel } from "./model-option";
import {
  OPERATION_ID_META,
  operationIdOf,
  operationUpdates,
  operationUsage,
  promptEntry,
  replayUpdates,
  responseOf,
} from "./operations";
import { websocketStream } from "./websocket-stream";

type AcpConnectParams = {
  socket: WebSocket;
  harness: PiHarness;
  cwd: string;
  name?: string;
  /**
   * The models that a client can select with the `model` session config option.
   * Each model must be available in the `Models` configured for Pi.
   * Without models, sessions have no config options.
   */
  models?: readonly AcpModel[];
};

type AttachedSession = {
  session: PiSession;
  client: AgentContext;
  watch: AcpSessionEventsWatcher;
};

const DEFAULT_NAME = "pi-acp";
const CURRENT_VERSION = "1.4.0";

export type { AcpModel } from "./model-option";
export { modelValue } from "./model-option";

/** Returns the model that Pi has for the session now. */
async function currentModel(session: PiSession): Promise<SessionModel | undefined> {
  const events = await session.events();

  try {
    return events.snapshot.agent.model;
  } finally {
    await events.stop();
  }
}

// Make an ACP agent connection for one WebSocket.
export function connectAcp(params: AcpConnectParams): AgentConnection {
  return new AcpAgent(params).connection;
}

class AcpAgent {
  readonly connection: AgentConnection;
  private harness: PiHarness;
  private cwd: string;
  private name: string;
  private models: readonly AcpModel[];
  private initialized = false;
  private attachedSessions = new Map<string, AttachedSession>();
  private runningPrompts = new Set<string>();

  constructor({ socket, harness, cwd, name = DEFAULT_NAME, models = [] }: AcpConnectParams) {
    this.harness = harness;
    this.cwd = cwd;
    this.name = name;
    this.models = models;
    this.connection = this.createACPAgentConnection(socket);

    void this.startCleanupWatcher();
  }

  private createACPAgentConnection(socket: WebSocket) {
    return acpAgent({ name: this.name })
      .onRequest(methods.agent.initialize, () => this.initialize())
      .onRequest(methods.agent.authenticate, () => this.authenticate())
      .onRequest(methods.agent.session.new, ({ params, client }) => this.newSession(params, client))
      .onRequest(methods.agent.session.load, ({ params, client }) =>
        this.loadSession(params, client),
      )
      .onRequest(methods.agent.session.prompt, ({ params }) => this.prompt(params))
      .onRequest(methods.agent.session.setConfigOption, ({ params }) =>
        this.setConfigOption(params),
      )
      .onNotification(methods.agent.session.cancel, ({ params }) => this.cancel(params))
      .connect(websocketStream(socket));
  }

  private initialize(): InitializeResponse {
    this.initialized = true;

    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo: { name: this.name, version: CURRENT_VERSION },
      agentCapabilities: { loadSession: true, _meta: { [OPERATION_ID_META]: true } },
      authMethods: [],
    };
  }

  // TODO: implement
  private authenticate(): never {
    throw RequestError.methodNotFound(methods.agent.authenticate);
  }

  private async newSession(
    params: NewSessionRequest,
    client: AgentContext,
  ): Promise<NewSessionResponse> {
    this.validateSessionSetup(params);
    const session = await this.harness.sessions.create();
    const attached = await this.attachSession(session, client);

    return { sessionId: session.id, ...(await this.configOf(attached)) };
  }

  private async loadSession(
    params: LoadSessionRequest,
    client: AgentContext,
  ): Promise<LoadSessionResponse> {
    this.validateSessionSetup(params);

    const attached = this.attachedSessions.get(params.sessionId);

    if (attached) {
      return await this.configOf(attached);
    }

    const available = await this.harness.sessions.list();

    if (!available.some((session) => session.id === params.sessionId)) {
      throw RequestError.invalidParams(undefined, "Unknown session");
    }

    const session = this.harness.session(params.sessionId);

    await this.replayHistory(session, client);

    return await this.configOf(await this.attachSession(session, client));
  }

  /**
   * Selects the model of a session. The model applies to the next generation, even while a
   * prompt runs.
   */
  private async setConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    const attached = this.requireAttached(params.sessionId);
    const model = typeof params.value === "string" ? modelOf(this.models, params.value) : undefined;

    if (params.configId !== MODEL_CONFIG_ID || !model) {
      throw RequestError.invalidParams(undefined, "Unknown config option or value");
    }

    await attached.session.setModel({ provider: model.provider, id: model.id });

    // The options show the model that Pi has now.
    return { configOptions: modelConfigOptions(this.models, await currentModel(attached.session)) };
  }

  /**
   * Returns the config options of an attached session, if the agent has models. A session
   * without a model gets the first of `models`, so the options show the model that Pi uses.
   */
  private async configOf(
    attached: AttachedSession,
  ): Promise<Pick<NewSessionResponse, "configOptions">> {
    const [first] = this.models;
    let model = first ? await currentModel(attached.session) : undefined;

    if (first && !model) {
      await attached.session.setModel({ provider: first.provider, id: first.id });
      model = await currentModel(attached.session);
    }

    const configOptions = modelConfigOptions(this.models, model);

    return configOptions.length === 0 ? {} : { configOptions };
  }

  /**
   * Runs a text prompt. A prompt with an operation ID first replays all operation output so far.
   * A new operation has no output to replay. If Pi already has the operation, the prompt reattaches to it.
   * The client receives the replay, followed by later updates and the result.
   * The operation runs once, even if its connection closes before completion.
   * The response for a prompt with an operation ID includes the operation's token usage.
   */
  private async prompt(params: PromptRequest): Promise<PromptResponse> {
    const attached = this.requireAttached(params.sessionId);
    const { session } = attached;

    if (!params.prompt.every((part) => part.type === "text")) {
      throw RequestError.invalidParams(undefined, "Only text prompts are supported");
    }

    const operationId = operationIdOf(params);

    if (operationId !== undefined && (await this.isKnown(session, operationId))) {
      await this.reattach(attached, operationId);

      return await this.responseOf(session, operationId, await session.wait(operationId));
    }

    if (this.runningPrompts.has(session.id)) {
      throw RequestError.invalidRequest("Session already has a running prompt");
    }

    this.runningPrompts.add(session.id);

    try {
      if (await session.busy()) {
        throw RequestError.invalidRequest("Session already has a running prompt");
      }

      const input = params.prompt.map((part) => ({ type: "text" as const, text: part.text }));

      // The new operation has no output yet. The replay tells the client where its output starts.
      if (operationId !== undefined) {
        await this.replay(attached, []);
      }

      // A prompt without an operation ID gets one, so its result can count its usage.
      const id = operationId ?? crypto.randomUUID();
      const result = await session.prompt(input, { operationId: id, entry: promptEntry(id) });

      return await this.responseOf(session, id, result);
    } finally {
      this.runningPrompts.delete(session.id);
    }
  }

  /** Returns the response of a settled operation with its token usage. */
  private async responseOf(
    session: PiSession,
    operationId: string,
    result: Awaited<ReturnType<PiSession["wait"]>>,
  ): Promise<PromptResponse> {
    return responseOf(result, operationUsage(await session.messages(), operationId));
  }

  /** Returns true if pi has the operation, settled or not. */
  private async isKnown(session: PiSession, operationId: string): Promise<boolean> {
    const pending = await this.harness.pending({ session: session.id });

    if (pending.some((operation) => operation.operationId === operationId)) {
      return true;
    }

    // `wait` resolves at once for a settled operation and for an unknown one.
    return (await session.wait(operationId)).reason !== "not_found";
  }

  /**
   * Stops the old session watch before opening a new one.
   * The new snapshot includes output not sent by the old watch. Replaying it before starting the new watch prevents missing output.
   */
  private async reattach(attached: AttachedSession, operationId: string): Promise<void> {
    const { session, client } = attached;
    await attached.watch.stop();
    const watch = await session.events();

    await this.replay(attached, operationUpdates(watch.snapshot, operationId));

    this.watchSession(session, client, watch).start();
  }

  /** Sends `updates` as the replay of an operation. Each update fits in one frame. */
  private async replay(
    { session, client }: AttachedSession,
    updates: readonly SessionUpdate[],
  ): Promise<void> {
    for (const update of replayUpdates(updates)) {
      // eslint-disable-next-line no-await-in-loop the updates must arrive in order
      await client.notify(methods.client.session.update, { sessionId: session.id, update });
    }
  }

  private async cancel(params: CancelNotification): Promise<void> {
    await this.requireSession(params.sessionId).abort();
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      // TODO: should we throw something else?
      throw RequestError.invalidRequest("Initialize ACP first");
    }
  }

  private validateSessionSetup(params: NewSessionRequest): void {
    this.requireInitialized();

    if (
      params.cwd !== this.cwd ||
      params.mcpServers.length !== 0 ||
      (params.additionalDirectories?.length ?? 0) !== 0
    ) {
      throw RequestError.invalidParams(
        undefined,
        `Use cwd ${this.cwd} with no MCP servers or additional directories`,
      );
    }
  }

  private requireSession(id: string): PiSession {
    return this.requireAttached(id).session;
  }

  private requireAttached(id: string): AttachedSession {
    this.requireInitialized();
    const attached = this.attachedSessions.get(id);

    if (!attached) {
      throw RequestError.invalidParams(undefined, "Unknown session");
    }

    return attached;
  }

  private async attachSession(session: PiSession, client: AgentContext): Promise<AttachedSession> {
    const previous = this.attachedSessions.get(session.id);
    const watch = this.watchSession(session, client, await session.events());
    await previous?.watch.stop();

    watch.start();

    return this.requireAttached(session.id);
  }

  /** Makes `events` the event watch of the session. The caller starts it. */
  private watchSession(
    session: PiSession,
    client: AgentContext,
    events: AgentEventStream,
  ): AcpSessionEventsWatcher {
    const watch = new AcpSessionEventsWatcher({
      sessionId: session.id,
      watch: events,
      client,
      signal: this.connection.signal,
      ...(this.models.length > 0 && {
        configOptionsOf: (model) => modelConfigOptions(this.models, model),
      }),
    });
    this.attachedSessions.set(session.id, { session, client, watch });

    return watch;
  }

  // Send the text of old messages to the client. Call this before new events start.
  private async replayHistory(session: PiSession, client: AgentContext): Promise<void> {
    for (const entry of await session.messages()) {
      const message = entry.model?.[0];

      if (!message || (message.role !== "user" && message.role !== "assistant")) {
        continue;
      }

      const content = Array.isArray(message.content)
        ? message.content
        : [{ type: "text", text: message.content }];

      for (const part of content) {
        if (part.type !== "text") {
          continue;
        }

        // A long message arrives in several chunks, so each frame stays within the limit.
        for (const text of textChunks(part.text)) {
          // eslint-disable-next-line no-await-in-loop we want to do this in order
          await client.notify(methods.client.session.update, {
            sessionId: session.id,
            update: {
              sessionUpdate: message.role === "user" ? "user_message_chunk" : "agent_message_chunk",
              content: { type: "text", text },
            },
          });
        }
      }
    }
  }

  // Stop the event watches when the client closes the connection.
  private async startCleanupWatcher(): Promise<void> {
    await this.connection.closed;
    await Promise.all([...this.attachedSessions.values()].map(({ watch }) => watch.stop()));
    this.attachedSessions.clear();
  }
}
