import { AgentSession as BaseSession } from "../src";
import type { SessionLifecyclePolicy } from "../src";
import {
  agent as acpAgent,
  methods as acpMethods,
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
  RequestError as ACPRequestError,
} from "@agentclientprotocol/sdk";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import type {
  AnyMessage as ACPAnyMessage,
  PromptResponse as ACPPromptResponse,
  Stream as ACPStream,
} from "@agentclientprotocol/sdk";
import { TEST_AGENT } from "./host";
import type { AgentHost } from "./host";
import type { AgentHostConnectionRouter } from "./router";
import type { SessionSubscribeRequest, SessionSubscribeResponse } from "../src/shared/rpc/session";
import type { TestEnv } from "./worker";

const INTERNAL_ERROR = -32_603;

// Short delays let a test see the alarms run.
// The attempt timeout stays long, so a held initialization does not time out.
const FAST_LIFECYCLE: SessionLifecyclePolicy = {
  createDeadlineMs: 10,
  createAttemptTimeoutMs: 60_000,
  createAttempts: 2,
  retryInitialDelayMs: 10,
  retryMaxDelayMs: 10,
  disposeFallbackMs: 10,
};

/** The number of agent streams, and the number that the session has not closed. */
type StreamCounts = { total: number; open: number };

/** The test side of one agent stream. */
type TestStream = { open: boolean; writeGate?: ReturnType<typeof Promise.withResolvers<null>> };

export class AgentSession extends BaseSession<TestEnv, AgentHostConnectionRouter, AgentHost> {
  private cancellations = 0;
  private setup?: ReturnType<typeof Promise.withResolvers<boolean>>;
  private pending?: ReturnType<typeof Promise.withResolvers<ACPPromptResponse>>;
  private subscribeGate?: ReturnType<typeof Promise.withResolvers<null>>;
  private heldSubscribes = 0;
  private lifecycle?: SessionLifecyclePolicy;
  private connectionFailure?: string;
  private connectionGate?: ReturnType<typeof Promise.withResolvers<null>>;
  private heldConnection?: ReturnType<typeof Promise.withResolvers<null>>;
  private streams: TestStream[] = [];
  private newestStream?: TestStream;

  router = this.env.CONNECTIONS;
  host = this.env.COORDINATORS;

  protected getAgentInfo(): AHPAgentInfo {
    return TEST_AGENT;
  }

  protected getLifecyclePolicy(): SessionLifecyclePolicy {
    return this.lifecycle ?? super.getLifecyclePolicy();
  }

  protected async connectAgent(): Promise<ACPStream> {
    if (this.connectionFailure !== undefined) {
      throw new Error(this.connectionFailure);
    }

    const gate = this.connectionGate;
    this.connectionGate = undefined;
    await gate?.promise;

    const requests: TransformStream<ACPAnyMessage, ACPAnyMessage> = new TransformStream();
    const responses: TransformStream<ACPAnyMessage, ACPAnyMessage> = new TransformStream();
    acpAgent()
      .onRequest(acpMethods.agent.initialize, () => ({
        protocolVersion: ACP_PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
      }))
      .onRequest(acpMethods.agent.session.new, async () => {
        if (this.setup && !(await this.setup.promise)) {
          throw new ACPRequestError(INTERNAL_ERROR, "Agent setup failed");
        }

        return { sessionId: crypto.randomUUID() };
      })
      .onRequest(acpMethods.agent.session.load, () => ({}))
      .onNotification(acpMethods.agent.session.cancel, () => {
        this.cancellations += 1;
        this.pending?.resolve({ stopReason: "cancelled" });
      })
      .onRequest(acpMethods.agent.session.prompt, async ({ params, client }) => {
        const [text] = params.prompt;
        const output = text?.type === "text" ? text.text : "";
        // "stream" arrives as several updates; anything else is a single update.
        const chunks = output === "stream" ? ["st", "re", "am"] : [output];

        await Promise.all(
          chunks.map((chunk) =>
            client.notify(acpMethods.client.session.update, {
              sessionId: params.sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: chunk },
              },
            }),
          ),
        );

        if (output === "hold") {
          this.pending = Promise.withResolvers<ACPPromptResponse>();

          return await this.pending.promise;
        }

        return { stopReason: "end_turn" };
      })
      .connect({ readable: requests.readable, writable: responses.writable });

    return this.trackStream({ readable: responses.readable, writable: requests.writable });
  }

  async subscribe(req: SessionSubscribeRequest): Promise<SessionSubscribeResponse> {
    if (this.subscribeGate) {
      this.heldSubscribes += 1;
      await this.subscribeGate.promise;
    }

    return await super.subscribe(req);
  }

  holdSubscribes(): void {
    this.subscribeGate = Promise.withResolvers<null>();
  }

  heldSubscribeCount(): number {
    return this.heldSubscribes;
  }

  releaseSubscribes(): void {
    this.subscribeGate?.resolve(null);
    this.subscribeGate = undefined;
  }

  /** Uses short alarm delays. Call it before the session opens its storage. */
  useFastLifecycle(overrides: Partial<SessionLifecyclePolicy> = {}): void {
    this.lifecycle = { ...FAST_LIFECYCLE, ...overrides };
  }

  /** Makes each agent connection fail with `message`, which is a transient failure. */
  failConnections(message: string): void {
    this.connectionFailure = message;
  }

  /** Makes the next agent connection wait in `connectAgent` until `releaseConnection`. */
  holdNextConnection(): void {
    this.connectionGate = Promise.withResolvers<null>();
    this.heldConnection = this.connectionGate;
  }

  /** Holds the writes to the newest agent stream until `releaseAgentWrites`. */
  holdAgentWrites(): void {
    if (this.newestStream) {
      this.newestStream.writeGate = Promise.withResolvers<null>();
    }
  }

  releaseAgentWrites(): void {
    for (const stream of this.streams) {
      stream.writeGate?.resolve(null);
      stream.writeGate = undefined;
    }
  }

  streamCounts(): StreamCounts {
    return {
      total: this.streams.length,
      open: this.streams.filter((stream) => stream.open).length,
    };
  }

  releaseConnection(): void {
    this.heldConnection?.resolve(null);
  }

  holdInitialization(): void {
    this.setup = Promise.withResolvers<boolean>();
  }

  releaseInitialization(success: boolean): void {
    this.setup?.resolve(success);
  }

  cancellationCount(): number {
    return this.cancellations;
  }

  finishPrompt(): void {
    this.pending?.resolve({ stopReason: "end_turn" });
  }

  /**
   * Wraps the session side of an agent stream. The wrapper records when the session closes the
   * stream, and holds writes while the stream has a write gate.
   */
  private trackStream({ readable, writable }: ACPStream): ACPStream {
    const stream: TestStream = { open: true };
    this.streams.push(stream);
    this.newestStream = stream;
    const reader = readable.getReader();
    const writer = writable.getWriter();

    return {
      readable: new ReadableStream({
        pull: async (controller): Promise<void> => {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        },
        cancel: async (reason): Promise<void> => {
          stream.open = false;
          await reader.cancel(reason);
        },
      }),
      writable: new WritableStream({
        write: async (message): Promise<void> => {
          await stream.writeGate?.promise;
          await writer.write(message);
        },
        close: async (): Promise<void> => {
          stream.open = false;
          await writer.close();
        },
        abort: async (reason): Promise<void> => {
          stream.open = false;
          await writer.abort(reason);
        },
      }),
    };
  }
}
