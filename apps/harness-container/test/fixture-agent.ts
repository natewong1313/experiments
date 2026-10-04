import type { AnyMessage } from "@agentclientprotocol/sdk";
import { createInterface } from "node:readline";
import { parseMessage } from "../container/messages.ts";

const lines = createInterface({ input: process.stdin });
let pendingPrompt: string | number | null = null;
function send(message: AnyMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
lines.on("line", (line) => {
  const message = parseMessage(line);
  const method = "method" in message ? message.method : null;
  const id = "id" in message ? message.id : null;
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: { protocolVersion: 1, pid: process.pid },
    });
  } else if (method === "session/prompt") {
    pendingPrompt = id;
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { text: "streamed 🌍\nsecond line" },
    });
    send({
      jsonrpc: "2.0",
      id: "permission-1",
      method: "session/request_permission",
      params: { sessionId: "s" },
    });
  } else if (id === "permission-1" && "result" in message) {
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { permission: message.result },
    });
  } else if (method === "session/cancel") {
    send({
      jsonrpc: "2.0",
      id: pendingPrompt,
      result: { stopReason: "cancelled" },
    });
  }
});
