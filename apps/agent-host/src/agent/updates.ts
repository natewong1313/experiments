import type { SessionNotification } from "@agentclientprotocol/sdk";

export function textUpdate(notification: SessionNotification): string | undefined {
  const { update } = notification;

  if (update.sessionUpdate === "agent_message_chunk" && update.content.type === "text") {
    return update.content.text;
  }

  return undefined;
}
