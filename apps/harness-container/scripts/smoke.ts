import {
  ClientSideConnection,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { connectWebSocket } from "./websocket-stream.ts";

const SMOKE_TIMEOUT_MS = 120_000;
const POSITIONAL_ARGUMENT_OFFSET = 2;
const [endpoint, prompt] = process.argv.slice(POSITIONAL_ARGUMENT_OFFSET);
const url = endpoint ?? "ws://localhost:8787/agents/smoke/acp";
const { socket, stream } = await connectWebSocket(url);
const timeout = setTimeout(() => {
  socket.terminate();
}, SMOKE_TIMEOUT_MS);
const connection = new ClientSideConnection(
  () => ({
    async sessionUpdate(params: SessionNotification): Promise<void> {
      const { update } = params;
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content.type === "text"
      ) {
        process.stdout.write(update.content.text);
      }
    },
    async requestPermission(): Promise<{ outcome: { outcome: "cancelled" } }> {
      return { outcome: { outcome: "cancelled" } };
    },
  }),
  stream,
);
try {
  const initialized = await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
    clientInfo: { name: "harness-container-smoke", version: "0.1.0" },
  });
  const session = await connection.newSession({
    cwd: process.env.WORKSPACE_DIR ?? "/workspace",
    mcpServers: [],
  });
  process.stderr.write(
    `${JSON.stringify({ agent: initialized.agentInfo, sessionId: session.sessionId, configOptions: session.configOptions })}\n`,
  );
  if (typeof prompt === "string") {
    const result = await connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: prompt }],
    });
    process.stderr.write(`${JSON.stringify(result)}\n`);
  }
} finally {
  clearTimeout(timeout);
  socket.close();
}
