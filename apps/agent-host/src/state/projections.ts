import { deepEqual } from "fast-equals";
import {
  ChatSummarySchema,
  type ChatState,
  type ChatSummary,
  type SessionState,
  type SessionSummary,
  type SessionAction,
} from "@experiments/protocol-schemas/ahp";
import type { LiveSession } from "../sessions/record";

const ChatChangesSchema = ChatSummarySchema.omit({ resource: true });

const SESSION_FLAGS = 96;

const ACTIVITY_MASK = 31;

function chatSummary(chat: ChatState): ChatSummary {
  return ChatSummarySchema.strip().parse(chat);
}

// Chat activity is projected onto the session through session.chats[0].
// It is the single stored representation of the live chat.
function sessionSummary(record: {
  uri: string;
  createdAt: string;
  modifiedAt: string;
  session: SessionState;
}): SessionSummary {
  const { provider, title, status, workingDirectories } = record.session;
  const chatStatus = record.session.chats.at(0)?.status ?? 0;

  return {
    resource: record.uri,
    provider,
    title,
    status: (chatStatus & ACTIVITY_MASK) | (status & SESSION_FLAGS),
    workingDirectories,
    createdAt: record.createdAt,
    modifiedAt: record.modifiedAt,
  };
}

function projectChat(
  record: Pick<LiveSession, "chatUri" | "session">,
  chat: ChatState,
): SessionAction | undefined {
  const summary = chatSummary(chat);

  if (deepEqual(summary, record.session.chats[0])) {
    return;
  }

  return {
    type: "session/chatUpdated",
    chat: record.chatUri,
    changes: ChatChangesSchema.strip().parse(summary),
  };
}

export { projectChat, sessionSummary };
