import {
  isoTimestampSchema,
  type StateAction,
} from "@experiments/protocol-schemas/ahp";
import type { LiveSession } from "../sessions/record";
import { ahpMessageToAcpPrompt } from "@experiments/protocol-schemas/acp";

function rejection(
  record: LiveSession,
  channel: string,
  action: StateAction,
  hasTurn: (turnId: string) => boolean,
): string | undefined {
  if (channel === record.uri) {
    switch (action.type) {
      case "session/titleChanged":
      case "session/isReadChanged":
      case "session/isArchivedChanged":
      case "session/metaChanged": {
        return;
      }
      case "session/defaultChatChanged": {
        return action.defaultChat === record.chatUri
          ? void 0
          : "Default chat must belong to the session";
      }
      default: {
        return "This session action is not supported for client dispatch";
      }
    }
  }
  switch (action.type) {
    case "chat/turnStarted": {
      if (!action.turnId) {
        return "Turn requires an ID";
      }
      if (record.session.lifecycle !== "ready") {
        return "Session is not ready";
      }
      if (record.chat.activeTurn) {
        return "A turn is already running";
      }
      if (hasTurn(action.turnId)) {
        return "Turn ID already exists";
      }
      if (!isoTimestampSchema.safeParse(action.startedAt).success) {
        return "Turn requires a valid start time";
      }
      if (action.queuedMessageId !== void 0) {
        return "Queued messages are not supported";
      }
      if (!ahpMessageToAcpPrompt(action.message).ok) {
        return "This host supports text prompts only";
      }
      if (action.message.model || action.message.agent) {
        return "This host uses the harness default agent and model";
      }
      return;
    }
    case "chat/turnCancelled": {
      return record.chat.activeTurn?.id === action.turnId
        ? void 0
        : "No matching active turn to cancel";
    }
    default: {
      return "This chat action is not supported for client dispatch";
    }
  }
}

export { rejection };
