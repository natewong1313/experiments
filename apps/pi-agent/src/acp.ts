import {
  agent,
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
import type { PiHarness, PiSession } from "agents/harnesses/pi";
import { eventUpdates } from "./acp-events";
import { websocketStream } from "./websocket-stream";

type AcpConnectParams = {
  socket: WebSocket;
  harness: PiHarness;
  cwd: string;
};

type AttachedSession = {
  session: PiSession;
  watch: AgentEventStream;
};

export function connectAcp(params: AcpConnectParams): AgentConnection {
  return new AcpAgent(params).connection;
}

class AcpAgent {
  readonly connection: AgentConnection;
  private readonly harness: PiHarness;
  private readonly cwd: string;
  private initialized = false;
  private readonly attachedSessions = new Map<string, AttachedSession>();
  private readonly runningPrompts = new Set<string>();

  constructor({ socket, harness, cwd }: AcpConnectParams) {
    this.harness = harness;
    this.cwd = cwd;
    this.connection = agent({ name: "pi-durable" })
      .onRequest(methods.agent.initialize, () => this.initialize())
      .onRequest(methods.agent.authenticate, () => this.authenticate())
      .onRequest(methods.agent.session.new, ({ params, client }) =>
        this.newSession(params, client),
      )
      .onRequest(methods.agent.session.load, ({ params, client }) =>
        this.loadSession(params, client),
      )
      .onRequest(methods.agent.session.prompt, ({ params }) =>
        this.prompt(params),
      )
      .onNotification(methods.agent.session.cancel, ({ params }) =>
        this.cancel(params),
      )
      .connect(websocketStream(socket));

    void this.cleanup();
  }

  private initialize(): InitializeResponse {
    this.initialized = true;

    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo: { name: "pi-durable", version: "0.99.2" },
      agentCapabilities: { loadSession: true },
      authMethods: [],
    };
  }

  private authenticate(): never {
    throw RequestError.invalidParams(void 0, "No authentication methods");
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

    await replayHistory(session, client);
    await this.attachSession(session, client);

    return {};
  }

  private async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.requireSession(params.sessionId);

    if (!params.prompt.every((part) => part.type === "text")) {
      throw RequestError.invalidParams(
        void 0,
        "Only text prompts are supported",
      );
    }

    if (this.runningPrompts.has(session.id)) {
      throw RequestError.invalidRequest("Session already has a running prompt");
    }

    this.runningPrompts.add(session.id);

    try {
      if (await session.busy()) {
        throw RequestError.invalidRequest(
          "Session already has a running prompt",
        );
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

  private async attachSession(
    session: PiSession,
    client: AgentContext,
  ): Promise<void> {
    const previous = this.attachedSessions.get(session.id);
    const watch = await session.events();
    this.attachedSessions.set(session.id, { session, watch });
    await previous?.watch.stop();
    startSessionWatch({
      sessionId: session.id,
      watch,
      client,
      signal: this.connection.signal,
    });
  }

  private async cleanup(): Promise<void> {
    await this.connection.closed;
    await Promise.all(
      [...this.attachedSessions.values()].map(({ watch }) => watch.stop()),
    );
    this.attachedSessions.clear();
  }
}

function startSessionWatch({
  sessionId,
  watch,
  client,
  signal,
}: {
  sessionId: string;
  watch: AgentEventStream;
  client: AgentContext;
  signal: AbortSignal;
}): void {
  const sentTextLengths: Map<number, number> = new Map();
  const currentToolOutputs: Map<string, string> = new Map();
  watch.start(async (events) => {
    for (const event of events) {
      if (signal.aborted) {
        return;
      }

      for (const update of eventUpdates(
        event,
        sentTextLengths,
        currentToolOutputs,
      )) {
        if (signal.aborted) {
          return;
        }

        try {
          // eslint-disable-next-line no-await-in-loop
          await client.notify(methods.client.session.update, {
            sessionId,
            update,
          });
        } catch (error) {
          if (signal.aborted) {
            return;
          }

          throw error;
        }
      }
    }
  });
  void watch.closed.then((end) => {
    if (end.reason === "listener_error") {
      console.error("ACP event watch terminated", {
        sessionId,
        reason: end.reason,
        error: end.error,
      });
    }
  });
}

async function replayHistory(
  session: PiSession,
  client: AgentContext,
): Promise<void> {
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

      // eslint-disable-next-line no-await-in-loop
      await client.notify(methods.client.session.update, {
        sessionId: session.id,
        update: {
          sessionUpdate:
            message.role === "user"
              ? "user_message_chunk"
              : "agent_message_chunk",
          content: { type: "text", text: part.text },
        },
      });
    }
  }
}
