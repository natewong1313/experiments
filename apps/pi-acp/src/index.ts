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
  PROTOCOL_VERSION,
  RequestError,
} from "@agentclientprotocol/sdk";
import type { AgentEventStream } from "@earendil-works/pi-durable";
import type { PiHarness, PiSession } from "agents/harness/pi";
import { AcpSessionEventsWatcher } from "./acp-session-watch";
import {
  OPERATION_ID_META,
  operationIdOf,
  operationText,
  promptEntry,
  replayUpdates,
  stopReasonOf,
  textChunks,
} from "./operations";
import { websocketStream } from "./websocket-stream";

type AcpConnectParams = {
  socket: WebSocket;
  harness: PiHarness;
  cwd: string;
  name?: string;
};

type AttachedSession = {
  session: PiSession;
  client: AgentContext;
  watch: AcpSessionEventsWatcher;
};

const DEFAULT_NAME = "pi-acp";
const CURRENT_VERSION = "1.4.0";

// Make an ACP agent connection for one WebSocket.
export function connectAcp(params: AcpConnectParams): AgentConnection {
  return new AcpAgent(params).connection;
}

class AcpAgent {
  readonly connection: AgentConnection;
  private harness: PiHarness;
  private cwd: string;
  private name: string;
  private initialized = false;
  private attachedSessions = new Map<string, AttachedSession>();
  private runningPrompts = new Set<string>();

  constructor({ socket, harness, cwd, name = DEFAULT_NAME }: AcpConnectParams) {
    this.harness = harness;
    this.cwd = cwd;
    this.name = name;
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
    await this.attachSession(session, client);

    return { sessionId: session.id };
  }

  private async loadSession(
    params: LoadSessionRequest,
    client: AgentContext,
  ): Promise<LoadSessionResponse> {
    this.validateSessionSetup(params);

    if (this.attachedSessions.has(params.sessionId)) {
      return {};
    }

    const available = await this.harness.sessions.list();

    if (!available.some((session) => session.id === params.sessionId)) {
      throw RequestError.invalidParams(undefined, "Unknown session");
    }

    const session = this.harness.session(params.sessionId);

    await this.replayHistory(session, client);
    await this.attachSession(session, client);

    return {};
  }

  /**
   * Runs a text prompt. A prompt with an operation ID first replays the text of the operation so
   * far, which is empty for a new operation. If pi already has the operation, the prompt
   * reattaches to it: the client receives the replay, then its later updates and its result.
   * The operation runs once, also when its connection closes before it settles.
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

      return stopReasonOf(await session.wait(operationId));
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

      if (operationId === undefined) {
        return stopReasonOf(await session.prompt(input));
      }

      // The new operation has no text yet. The replay tells the client where its text starts.
      await this.replay(attached, "");

      return stopReasonOf(
        await session.prompt(input, { operationId, entry: promptEntry(operationId) }),
      );
    } finally {
      this.runningPrompts.delete(session.id);
    }
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
   * Replaces the event watch of the session with one that starts with the text of the
   * operation so far. The old watch stops first, and the new snapshot holds everything that it
   * did not send, so the client misses nothing after the replay.
   */
  private async reattach(attached: AttachedSession, operationId: string): Promise<void> {
    const { session, client } = attached;
    await attached.watch.stop();
    const watch = await session.events();

    await this.replay(attached, operationText(watch.snapshot, operationId));

    this.watchSession(session, client, watch).start();
  }

  /** Sends `text` as the replay of an operation, in chunks that fit in one frame each. */
  private async replay({ session, client }: AttachedSession, text: string): Promise<void> {
    for (const update of replayUpdates(text)) {
      // eslint-disable-next-line no-await-in-loop the chunks must arrive in order
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

  private async attachSession(session: PiSession, client: AgentContext): Promise<void> {
    const previous = this.attachedSessions.get(session.id);
    const watch = this.watchSession(session, client, await session.events());
    await previous?.watch.stop();

    watch.start();
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
