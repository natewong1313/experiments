import * as z from "zod";
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
import type { OpenCodeHarness } from "agents/harness/opencode";
import type { AcpHarness, HarnessSession, SessionWatch } from "./harness";
import { piHarness } from "./pi";
import { openCodeHarness } from "./opencode";
import type { PiHarness } from "agents/harness/pi";
import { MODEL_CONFIG_ID, modelConfigOptions, modelOf } from "./model-option";
import type { AcpModel } from "./model-option";
import { OPERATION_ID_META, operationIdOf, replayUpdates } from "./operations";
import { websocketStream } from "./websocket-stream";

type AcpConnectParams = {
  socket: WebSocket;
  harness: PiHarness | OpenCodeHarness;
  cwd: string;
  name?: string;
  /**
   * The models that a client can select with the `model` session config option.
   * Each model must be available in the configured harness.
   * Without models, sessions have no config options.
   */
  models?: readonly AcpModel[];
};

type AttachedSession = {
  session: HarnessSession;
  client: AgentContext;
  watch: SessionWatch;
};

const DEFAULT_NAME = "harness-acp";
const CURRENT_VERSION = "1.4.0";

export type { AcpModel } from "./model-option";

export { modelValue } from "./model-option";

// Make an ACP agent connection for one WebSocket.
export function connectAcp(params: AcpConnectParams): AgentConnection {
  return new AcpAgent(params).connection;
}

class AcpAgent {
  readonly connection: AgentConnection;
  private harness: AcpHarness;
  private cwd: string;
  private name: string;
  private models: readonly AcpModel[];
  private initialized = false;
  private attachedSessions: Map<string, AttachedSession> = new Map();
  private runningPrompts: Set<string> = new Set();

  constructor({ socket, harness, cwd, name = DEFAULT_NAME, models = [] }: AcpConnectParams) {
    this.harness =
      "opencode" in harness ? openCodeHarness(harness, models) : piHarness(harness, models);
    this.cwd = cwd;
    this.name = name;
    this.models = models;
    this.connection = this.createACPAgentConnection(socket);

    void this.startCleanupWatcher();
  }

  private createACPAgentConnection(socket: WebSocket): AgentConnection {
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
    const session = await this.harness.create();
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

    const available = await this.harness.list();

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
    const value = z.string().safeParse(params.value);
    const model = value.success ? modelOf(this.models, value.data) : undefined;

    if (params.configId !== MODEL_CONFIG_ID || !model) {
      throw RequestError.invalidParams(undefined, "Unknown config option or value");
    }

    await attached.session.setModel({ provider: model.provider, id: model.id });

    return {
      configOptions: modelConfigOptions(this.models, await attached.session.currentModel()),
    };
  }

  /**
   * Returns the config options of an attached session, if the agent has models.
   * A session without a model gets the first of `models` before the options are returned.
   */
  private async configOf(
    attached: AttachedSession,
  ): Promise<Pick<NewSessionResponse, "configOptions">> {
    const [first] = this.models;
    let model = first ? await attached.session.currentModel() : undefined;

    if (first && !model) {
      await attached.session.setModel({ provider: first.provider, id: first.id });
      model = await attached.session.currentModel();
    }

    const configOptions = modelConfigOptions(this.models, model);

    return configOptions.length === 0 ? {} : { configOptions };
  }

  /**
   * Runs a text prompt. A prompt with an operation ID first replays all operation output so far.
   * A new operation has no output to replay.
   * If the harness already has the operation, the prompt reattaches to it.
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

    if (operationId !== undefined && (await session.known(operationId))) {
      await this.reattach(attached, operationId);

      const result = await session.wait(operationId);
      await this.requireAttached(session.id).watch.flush();

      return result;
    }

    if (this.runningPrompts.has(session.id)) {
      throw RequestError.invalidRequest("Session already has a running prompt");
    }

    this.runningPrompts.add(session.id);

    try {
      if (await session.busy()) {
        throw RequestError.invalidRequest("Session already has a running prompt");
      }

      // The new operation has no output yet. The replay tells the client where its output starts.
      if (operationId !== undefined) {
        await this.replay(attached, []);
      }

      // A prompt without an operation ID gets one, so its result can count its usage.
      const id = operationId ?? crypto.randomUUID();
      const result = await session.prompt(params.prompt.map((part) => part.text).join("\n"), id);
      await this.requireAttached(session.id).watch.flush();

      return result;
    } finally {
      this.runningPrompts.delete(session.id);
    }
  }

  /**
   * Stops the old session watch before opening a new one.
   * The new snapshot includes output not sent by the old watch. Replaying it before starting the new watch prevents missing output.
   */
  private async reattach(attached: AttachedSession, operationId: string): Promise<void> {
    const { session, client } = attached;
    await attached.watch.stop();
    const watch = await this.watchSession(session, client);

    await this.replay(attached, watch.replay(operationId));

    watch.start();
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

  private requireSession(id: string): HarnessSession {
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

  private async attachSession(
    session: HarnessSession,
    client: AgentContext,
  ): Promise<AttachedSession> {
    const previous = this.attachedSessions.get(session.id);
    const watch = await this.watchSession(session, client);
    await previous?.watch.stop();

    watch.start();

    return this.requireAttached(session.id);
  }

  private async watchSession(session: HarnessSession, client: AgentContext): Promise<SessionWatch> {
    const watch = await session.watch(
      (update) => client.notify(methods.client.session.update, { sessionId: session.id, update }),
      this.connection.signal,
    );

    this.attachedSessions.set(session.id, { session, client, watch });

    return watch;
  }

  // Send the text of old messages to the client. Call this before new events start.
  private async replayHistory(session: HarnessSession, client: AgentContext): Promise<void> {
    for (const update of await session.history()) {
      await client.notify(methods.client.session.update, { sessionId: session.id, update });
    }
  }

  // Stop the event watches when the client closes the connection.
  private async startCleanupWatcher(): Promise<void> {
    await this.connection.closed;
    await Promise.all([...this.attachedSessions.values()].map(({ watch }) => watch.stop()));
    this.attachedSessions.clear();
  }
}
