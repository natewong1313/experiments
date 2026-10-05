import { expect, it } from "vitest";
import { websocketStream } from "../src/agent/websocket-stream";

const PAYLOAD_BYTES = 700_000;

const FRAMES = 5;

it("closes an overloaded ACP stream before the incoming queue can grow without a limit", async () => {
  const { 0: host, 1: agent } = new WebSocketPair();
  host.accept();
  agent.accept();
  const stream = websocketStream(host);
  const reader = stream.readable.getReader();

  async function queueFailure(): Promise<string> {
    try {
      await reader.closed;

      return "Stream closed normally";
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }

      throw error;
    }
  }

  const failure = queueFailure();

  const frame = JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "session",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "x".repeat(PAYLOAD_BYTES) },
      },
    },
  });

  for (let index = 0; index < FRAMES; index++) {
    agent.send(frame);
  }

  try {
    expect(await failure).toBe("ACP incoming queue exceeds the memory budget");
  } finally {
    reader.releaseLock();
    agent.close();
  }
});
