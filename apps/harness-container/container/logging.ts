import type { AnyMessage } from "@agentclientprotocol/sdk";

type LogFields = Record<string, string | number | boolean | null | undefined>;

function logEvent(event: string, fields: LogFields = {}): void {
  const timestamp = new Date().toISOString();

  process.stderr.write(`${JSON.stringify({ timestamp, event, ...fields })}\n`);
}

function logMessage(
  message: AnyMessage,
  connectionId: string,
  direction: "client_to_agent" | "agent_to_client",
): void {
  if ("method" in message) {
    if (message.method === "session/update" && !("id" in message)) {
      return;
    }

    logEvent("acp_message", {
      connectionId,
      direction,
      method: message.method,
      id: "id" in message ? message.id : null,
    });
  } else {
    logEvent("acp_response", {
      connectionId,
      direction,
      id: message.id,
      success: !("error" in message),
      errorCode: "error" in message ? message.error.code : null,
    });
  }
}

export { logEvent, logMessage };
