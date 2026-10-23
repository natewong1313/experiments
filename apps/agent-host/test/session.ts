import * as z from "zod";
import { AgentHostSession as BaseSession } from "../src";
import type { SessionLifecyclePolicy } from "../src";
import {
  agent as acpAgent,
  methods as acpMethods,
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
  RequestError as ACPRequestError,
} from "@agentclientprotocol/sdk";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import type {
  AgentConnection as ACPAgentConnection,
  AnyMessage as ACPAnyMessage,
  PromptResponse as ACPPromptResponse,
  SessionConfigOption as ACPSessionConfigOption,
  SessionUpdate as ACPSessionUpdate,
  Stream as ACPStream,
} from "@agentclientprotocol/sdk";
import { TEST_AGENT } from "./host";
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
  // A turn continues from `restoreAfterRestart` at once, so the heartbeat stays long.
  turnHeartbeatMs: 60_000,
  turnAttempts: 2,
};

const OPERATION_ID_META = "agent-host/operationId";
const REPLAY_META = "agent-host/replay";

// The test agent replays in small chunks, so a test sees the session join them.
const REPLAY_CHUNK_LENGTH = 2;

/** Marks the first and the last chunk of a replay. */
type ReplayMarker = { start: boolean; end: boolean };

const PromptMetaSchema = z.object({ [OPERATION_ID_META]: z.string().optional() }).nullish();

/** A test operation retains its output for replay and its result after completion. */
type TestOperation = { updates: ACPSessionUpdate[]; result?: ACPPromptResponse };

// The values of the `model` config option are the model IDs that the host lists.
const TEST_MODELS = TEST_AGENT.models.map((model) => model.id);

// The usage that the test agent reports for the "tools" prompt.
const TOOLS_USAGE = { totalTokens: 3, inputTokens: 2, outputTokens: 1 };

function textUpdate(text: string): ACPSessionUpdate {
  return { sessionUpdate: "agent_message_chunk", content: { type: "text", text } };
}

/**
 * Returns scripted output for `text`. The "stream" prompt produces three text chunks.
 * The "tools" and "hold tools" prompts produce thinking and file-read updates. Only "tools" adds a final text answer.
 * All other prompts return their input as one text chunk.
 */
function scriptOf(text: string): ACPSessionUpdate[] {
  if (text === "stream") {
    return ["st", "re", "am"].map((chunk) => textUpdate(chunk));
  }

  if (text !== "tools" && text !== "hold tools") {
    return [textUpdate(text)];
  }

  return [
    { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Thinking" } },
    {
      sessionUpdate: "tool_call",
      toolCallId: "read-1",
      title: "read",
      name: "read",
      kind: "read",
      status: "in_progress",
      rawInput: { path: "/a" },
    },
    {
      sessionUpdate: "tool_call_update",
      toolCallId: "read-1",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "file text" } }],
    },
    ...(text === "tools" ? [textUpdate("Done")] : []),
  ];
}

/** Splits replayed message text into short chunks to test how the session joins them. */
function replayChunks(update: ACPSessionUpdate): ACPSessionUpdate[] {
  if (update.sessionUpdate !== "agent_message_chunk" || update.content.type !== "text") {
    return [update];
  }

  const { text } = update.content;
  const count = Math.max(1, Math.ceil(text.length / REPLAY_CHUNK_LENGTH));

  return Array.from({ length: count }, (_, index) =>
    textUpdate(text.slice(index * REPLAY_CHUNK_LENGTH, (index + 1) * REPLAY_CHUNK_LENGTH)),
  );
}

function modelOptions({ model, offeredModels }: DurableAgent): ACPSessionConfigOption[] {
  return [
    {
      type: "select",
      id: "model",
      name: "Model",
      category: "model",
      currentValue: model,
      options: offeredModels.map((value) => ({ value, name: value })),
    },
  ];
}

/**
 * The agent state of one session object. It outlives a restart of the object, as the state of a
 * separate agent would. A prompt with an operation ID runs once, and a repeated prompt
 * reattaches to it. The state holds only data: the runtime does not let an object use the
 * promises and streams of the object before its restart.
 */
type DurableAgent = {
  operations: Map<string, TestOperation>;
  // The prompt that waits for `finishPrompt` or a cancellation.
  held?: TestOperation;
  operationsDisabled: boolean;
  // The value of the `model` config option.
  model: string;
  // The values that the `model` config option offers.
  offeredModels: string[];
};

const durableAgents: Map<string, DurableAgent> = new Map();

/**
 * Ends the held prompt of the session object `name` without a call to the object, as a separate
 * agent would while the object restarts. The text stays in the prompt for a reattachment.
 */
export function finishHeldPrompt(name: string, text: string): void {
  const held = durableAgents.get(name)?.held;

  if (!held) {
    throw new Error("No held prompt");
  }

  held.updates.push(textUpdate(text));
  held.result = { stopReason: "end_turn" };
}

type HeldRun = {
  operation: TestOperation;
  send(update: ACPSessionUpdate): Promise<void>;
  result: ReturnType<typeof Promise.withResolvers<ACPPromptResponse>>;
};

/** The number of agent streams, and the number that the session has not closed. */
type StreamCounts = { total: number; open: number };

/** The test side of one agent stream. */
type TestStream = {
  open: boolean;
  writeGate?: ReturnType<typeof Promise.withResolvers<null>>;
  // Ends the stream with an error on the session side, as a lost connection does.
  drop?(): void;
};

export class AgentSession extends BaseSession<TestEnv> {
  private cancellations = 0;
  private setup?: ReturnType<typeof Promise.withResolvers<boolean>>;
  private subscribeGate?: ReturnType<typeof Promise.withResolvers<null>>;
  private heldSubscribes = 0;
  private lifecycle?: SessionLifecyclePolicy;
  private connectionFailure?: string;
  private connectionGate?: ReturnType<typeof Promise.withResolvers<null>>;
  private heldConnection?: ReturnType<typeof Promise.withResolvers<null>>;
  private streams: TestStream[] = [];
  private newestStream?: TestStream;
  private agentConnections: ACPAgentConnection[] = [];
  private heldRun?: HeldRun;

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
    const agent = this.durableAgent();

    const connection = acpAgent()
      .onRequest(acpMethods.agent.initialize, () => ({
        protocolVersion: ACP_PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: true,
          ...(!agent.operationsDisabled && { _meta: { [OPERATION_ID_META]: true } }),
        },
      }))
      .onRequest(acpMethods.agent.session.new, async () => {
        if (this.setup && !(await this.setup.promise)) {
          throw new ACPRequestError(INTERNAL_ERROR, "Agent setup failed");
        }

        return { sessionId: crypto.randomUUID(), configOptions: modelOptions(agent) };
      })
      .onRequest(acpMethods.agent.session.load, () => ({
        configOptions: modelOptions(agent),
      }))
      .onRequest(acpMethods.agent.session.setConfigOption, ({ params }) => {
        const value = z.string().safeParse(params.value);

        if (params.configId !== "model" || !value.success) {
          throw ACPRequestError.invalidParams(undefined, "Unknown config option");
        }

        agent.model = value.data;

        return { configOptions: modelOptions(agent) };
      })
      .onNotification(acpMethods.agent.session.cancel, () => {
        this.cancellations += 1;
        this.endHeld({ stopReason: "cancelled" });
      })
      .onRequest(acpMethods.agent.session.prompt, async ({ params, client }) => {
        const [text] = params.prompt;
        const output = text?.type === "text" ? text.text : "";
        const operationId = PromptMetaSchema.parse(params._meta)?.[OPERATION_ID_META];

        async function send(update: ACPSessionUpdate, marker?: ReplayMarker): Promise<void> {
          await client.notify(acpMethods.client.session.update, {
            sessionId: params.sessionId,
            update: { ...update, ...(marker && { _meta: { [REPLAY_META]: marker } }) },
          });
        }

        // A prompt with an operation ID first replays the output of the operation so far.
        async function replay(updates: readonly ACPSessionUpdate[]): Promise<void> {
          const replayed = updates.flatMap((update) => replayChunks(update));

          if (replayed.length === 0) {
            replayed.push(textUpdate(""));
          }

          for (const [index, update] of replayed.entries()) {
            // oxlint-disable-next-line no-await-in-loop -- the updates must arrive in order
            await send(update, { start: index === 0, end: index === replayed.length - 1 });
          }
        }

        const known = operationId === undefined ? undefined : agent.operations.get(operationId);

        if (known !== undefined) {
          await replay(known.updates);

          return known.result ?? (await this.holdRun(known, send));
        }

        const operation: TestOperation = { updates: scriptOf(output) };

        if (operationId !== undefined) {
          agent.operations.set(operationId, operation);
          await replay([]);
        }

        for (const update of operation.updates) {
          // oxlint-disable-next-line no-await-in-loop -- the updates must arrive in order
          await send(update);
        }

        if (output === "hold" || output === "hold tools") {
          agent.held = operation;

          return await this.holdRun(operation, send);
        }

        operation.result = {
          stopReason: "end_turn",
          ...(output === "tools" && { usage: TOOLS_USAGE }),
        };

        return operation.result;
      })
      .connect({ readable: requests.readable, writable: responses.writable });

    this.agentConnections.push(connection);

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

  /**
   * Ends the held prompt. The prompt first sends `text` to the newest connection that prompted
   * it. The text stays in the prompt if that connection is closed.
   */
  async finishPrompt(text?: string): Promise<void> {
    const { held } = this.durableAgent();

    if (held && text !== undefined) {
      const update = textUpdate(text);
      held.updates.push(update);

      try {
        await this.heldRun?.send(update);
      } catch {
        // The connection closed. The text stays in the prompt for a reattachment.
      }
    }

    this.endHeld({ stopReason: "end_turn" });
  }

  /** Breaks every agent connection, as a restart of a separate agent does. */
  dropAgentConnections(): void {
    for (const stream of this.streams) {
      stream.drop?.();
    }

    for (const connection of this.agentConnections.splice(0)) {
      connection.close();
    }
  }

  /** Makes the agent of this session ignore operation IDs, also after an eviction. */
  disableOperations(): void {
    this.durableAgent().operationsDisabled = true;
  }

  /** Makes the agent offer only `models`, also after an eviction. */
  offerModels(models: string[]): void {
    this.durableAgent().offeredModels = models;
  }

  /** Returns the value of the agent's `model` config option. */
  agentModel(): string {
    return this.durableAgent().model;
  }

  /** Waits until the held prompt ends in this object, and sends its later updates to `send`. */
  private async holdRun(
    operation: TestOperation,
    send: (update: ACPSessionUpdate) => Promise<void>,
  ): Promise<ACPPromptResponse> {
    this.heldRun?.result.resolve({ stopReason: "cancelled" });
    this.heldRun = { operation, send, result: Promise.withResolvers<ACPPromptResponse>() };

    return await this.heldRun.result.promise;
  }

  private endHeld(result: ACPPromptResponse): void {
    const { held } = this.durableAgent();

    if (held) {
      held.result ??= result;
    }

    this.heldRun?.result.resolve(held?.result ?? result);
  }

  private durableAgent(): DurableAgent {
    const name = this.ctx.id.name ?? "";

    const agent = durableAgents.get(name) ?? {
      operations: new Map(),
      operationsDisabled: false,
      model: TEST_MODELS[0] ?? "",
      offeredModels: TEST_MODELS,
    };

    durableAgents.set(name, agent);

    return agent;
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
        start: (controller): void => {
          stream.drop = (): void => {
            stream.open = false;
            controller.error(new Error("Agent connection dropped"));
            void cancelReader(reader);
          };
        },
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

/** Cancels the agent side of a dropped stream. The agent may have closed it already. */
async function cancelReader(reader: ReadableStreamDefaultReader<ACPAnyMessage>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The stream is closed.
  }
}
