import { expect, it, vi } from "vitest";
import {
  agent,
  methods,
  PROTOCOL_VERSION,
  type AnyMessage,
  type PromptResponse,
  type Stream,
} from "@agentclientprotocol/sdk";
import { AgentConnections } from "../src/agent/acp";
import type { AgentBinding } from "../src/sessions/record";

const CONNECT_TIMEOUT_MS = 30_000;

const RECORD: AgentBinding = {
  uri: "ahp-session:/stream",
  sessionKey: "stream",
  acpSession: null,
  session: { workingDirectories: ["file:///workspace"] },
};

type StreamPair = { host: Stream; backend: Stream; cancelled: Promise<boolean> };

async function connectionError(operation: Promise<unknown>): Promise<Error | null> {
  try {
    await operation;

    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function messageChannel(): Stream & { cancelled: Promise<boolean> } {
  const controller = Promise.withResolvers<ReadableStreamDefaultController<AnyMessage>>();
  const cancelled = Promise.withResolvers<boolean>();

  return {
    readable: new ReadableStream<AnyMessage>({
      start(value): void {
        controller.resolve(value);
      },
      cancel(): void {
        cancelled.resolve(true);
      },
    }),
    writable: new WritableStream<AnyMessage>({
      async write(message): Promise<void> {
        const readableController = await controller.promise;

        readableController.enqueue(message);
      },
    }),
    cancelled: cancelled.promise,
  };
}

function streamPair(): StreamPair {
  const requests = messageChannel();
  const responses = messageChannel();

  return {
    host: { readable: responses.readable, writable: requests.writable },
    backend: { readable: requests.readable, writable: responses.writable },
    cancelled: responses.cancelled,
  };
}

it("runs ACP over message streams and cancels the readable on release", async () => {
  const { host, backend, cancelled } = streamPair();

  const server = agent()
    .onRequest(methods.agent.initialize, () => ({ protocolVersion: PROTOCOL_VERSION }))
    .onRequest(methods.agent.session.new, () => ({ sessionId: "stream-session" }))
    .onRequest(methods.agent.session.prompt, () => ({ stopReason: "end_turn" }))
    .connect(backend);

  const agents = new AgentConnections({
    connect: async (): Promise<Stream> => host,
    updates: (): void => {},
  });

  try {
    const conversation = await agents.get(RECORD);
    expect(conversation.sessionId).toBe("stream-session");
    expect(await conversation.prompt({ text: "Hello" })).toMatchObject({
      outcome: "done",
      stopReason: "end_turn",
    });
    await agents.release(RECORD);
    expect(conversation.closed).toBe(true);
    expect(await cancelled).toBe(true);
  } finally {
    await agents.release(RECORD);
    server.close();
  }
});

it("rejects a pending prompt immediately when the conversation is aborted", async () => {
  const { host, backend, cancelled } = streamPair();
  const entered = Promise.withResolvers<boolean>();
  const response = Promise.withResolvers<PromptResponse>();

  const server = agent()
    .onRequest(methods.agent.initialize, () => ({ protocolVersion: PROTOCOL_VERSION }))
    .onRequest(methods.agent.session.new, () => ({ sessionId: "stream-session" }))
    .onRequest(methods.agent.session.prompt, () => {
      entered.resolve(true);

      return response.promise;
    })
    .connect(backend);

  const agents = new AgentConnections({
    connect: async (): Promise<Stream> => host,
    updates: (): void => {},
  });

  try {
    const conversation = await agents.get(RECORD);
    const failed = connectionError(conversation.prompt({ text: "Hello" }));
    await entered.promise;
    conversation.abort();
    expect(await failed).toMatchObject({ message: "Agent operation aborted" });
    expect(conversation.closed).toBe(true);
    expect(await cancelled).toBe(true);
  } finally {
    await agents.release(RECORD);
    server.close();
    response.resolve({ stopReason: "end_turn" });
  }
});

it.each([methods.agent.initialize, methods.agent.session.new])(
  "cancels a stream when %s exceeds its setup deadline",
  async (stalledMethod) => {
    const { host, backend, cancelled } = streamPair();
    const stalled = Promise.withResolvers<never>();
    const entered = Promise.withResolvers<boolean>();

    const server = agent()
      .onRequest(methods.agent.initialize, () => {
        if (stalledMethod === methods.agent.initialize) {
          entered.resolve(true);

          return stalled.promise;
        }

        return { protocolVersion: PROTOCOL_VERSION };
      })
      .onRequest(methods.agent.session.new, () => {
        entered.resolve(true);

        return stalled.promise;
      })
      .connect(backend);

    const agents = new AgentConnections({
      connect: async (): Promise<Stream> => host,
      updates: (): void => {},
    });

    vi.useFakeTimers();

    try {
      const failed = connectionError(agents.get(RECORD));
      await entered.promise;
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
      expect(await failed).toMatchObject({ message: "Agent operation timed out" });
      expect(await cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
      server.close();
      stalled.reject(new Error("Test finished"));
    }
  },
);

it("disposes both sides of a stream returned after the connection deadline", async () => {
  const pending = Promise.withResolvers<Stream>();
  const cancelled = Promise.withResolvers<boolean>();
  const aborted = Promise.withResolvers<boolean>();

  const agents = new AgentConnections({
    connect: (): Promise<Stream> => pending.promise,
    updates: (): void => {},
  });

  vi.useFakeTimers();

  try {
    const failed = connectionError(agents.get(RECORD));
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
    expect(await failed).toMatchObject({ message: "Agent operation timed out" });
    pending.resolve({
      readable: new ReadableStream<AnyMessage>({
        cancel(): void {
          cancelled.resolve(true);
        },
      }),
      writable: new WritableStream<AnyMessage>({
        abort(): void {
          aborted.resolve(true);
        },
      }),
    });
    expect(await cancelled.promise).toBe(true);
    expect(await aborted.promise).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
