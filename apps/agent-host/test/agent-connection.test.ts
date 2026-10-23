import { expect, it } from "vitest";
import {
  agent as acpAgent,
  methods as acpMethods,
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import type { AnyMessage as ACPAnyMessage, Stream as ACPStream } from "@agentclientprotocol/sdk";
import { AgentConnection } from "../src/session/agent-connection";
import type { PromptOutput } from "../src/session/agent-connection";

// The first output handler waits this long, so the next update arrives while it runs.
const SLOW_HANDLER_MS = 20;

/** Returns a stream to an in-process agent whose prompt starts a tool call and completes it. */
function toolAgentStream(): ACPStream {
  const requests: TransformStream<ACPAnyMessage, ACPAnyMessage> = new TransformStream();
  const responses: TransformStream<ACPAnyMessage, ACPAnyMessage> = new TransformStream();

  acpAgent()
    .onRequest(acpMethods.agent.initialize, () => ({
      protocolVersion: ACP_PROTOCOL_VERSION,
      agentCapabilities: {},
    }))
    .onRequest(acpMethods.agent.session.new, () => ({ sessionId: "session" }))
    .onRequest(acpMethods.agent.session.prompt, async ({ params, client }) => {
      await client.notify(acpMethods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call",
          title: "read",
          status: "in_progress",
        },
      });
      await client.notify(acpMethods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: "tool_call_update", toolCallId: "call", status: "completed" },
      });

      return { stopReason: "end_turn" };
    })
    .connect({ readable: requests.readable, writable: responses.writable });

  return { readable: responses.readable, writable: requests.writable };
}

it("handles the output of a prompt one update at a time, before the prompt returns", async () => {
  const connection = new AgentConnection();
  await connection.open({
    stream: async () => await Promise.resolve(toolAgentStream()),
    cwd: "/",
    sessionId: null,
    models: [],
  });

  const events: string[] = [];
  let handled = 0;

  const response = await connection.prompt("read", async (output: PromptOutput) => {
    const name = output.kind === "live" ? output.update.sessionUpdate : output.kind;
    handled += 1;
    events.push(`start ${name}`);

    if (handled === 1) {
      await scheduler.wait(SLOW_HANDLER_MS);
    }

    events.push(`end ${name}`);
  });

  events.push("response");
  connection.close();

  expect(response.stopReason).toBe("end_turn");
  expect(events).toEqual([
    "start tool_call",
    "end tool_call",
    "start tool_call_update",
    "end tool_call_update",
    "response",
  ]);
});
