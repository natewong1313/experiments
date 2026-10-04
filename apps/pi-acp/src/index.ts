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
import type { PiHarness, PiSession } from "agents/harnesses/pi";
import { AcpSessionEventsWatcher } from "./acp-session-watch";
import { websocketStream } from "./websocket-stream";

type AcpConnectParams = {
  socket: WebSocket;
  harness: PiHarness;
  cwd: string;
  name?: string;
};

type AttachedSession = {
  session: PiSession;
  watch: AcpSessionEventsWatcher;
};

const DEFAULT_NAME = "pi-acp";
const CURRENT_VERSION = "0.99.2";

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
      agentCapabilities: { loadSession: true },
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
      throw RequestError.invalidParams(void 0, "Unknown session");
    }

    const session = this.harness.session(params.sessionId);

    await this.replayHistory(session, client);
    await this.attachSession(session, client);

    return {};
  }

  private async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.requireSession(params.sessionId);

    if (!params.prompt.every((part) => part.type === "text")) {
      throw RequestError.invalidParams(void 0, "Only text prompts are supported");
    }

    if (this.runningPrompts.has(session.id)) {
      throw RequestError.invalidRequest("Session already has a running prompt");
    }

    this.runningPrompts.add(session.id);

    try {
      if (await session.busy()) {
        throw RequestError.invalidRequest("Session already has a running prompt");
      }

      const result = await session.prompt(
        params.prompt.map((part) => ({ type: "text", text: part.text })),
      );

      if (result.status === "unanswered" && result.reason !== "aborted") {
        throw new Error(result.reason ?? "Pi did not answer the prompt");
      }

      return {
        stopReason: result.status === "done" ? "end_turn" : "cancelled",
      };
    } finally {
      this.runningPrompts.delete(session.id);
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
        void 0,
        `Use cwd ${this.cwd} with no MCP servers or additional directories`,
      );
    }
  }

  private requireSession(id: string): PiSession {
    this.requireInitialized();
    const attached = this.attachedSessions.get(id);

    if (!attached) {
      throw RequestError.invalidParams(void 0, "Unknown session");
    }

    return attached.session;
  }

  private async attachSession(session: PiSession, client: AgentContext): Promise<void> {
    const previous = this.attachedSessions.get(session.id);
    const watch = new AcpSessionEventsWatcher({
      sessionId: session.id,
      watch: await session.events(),
      client,
      signal: this.connection.signal,
    });
    this.attachedSessions.set(session.id, { session, watch });
    await previous?.watch.stop();

    watch.start();
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

        // eslint-disable-next-line no-await-in-loop we want to do this in order
        await client.notify(methods.client.session.update, {
          sessionId: session.id,
          update: {
            sessionUpdate: message.role === "user" ? "user_message_chunk" : "agent_message_chunk",
            content: { type: "text", text: part.text },
          },
        });
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
