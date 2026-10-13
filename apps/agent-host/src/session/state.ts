import {
  ActionType as AHPActionType,
  SessionLifecycle as AHPSessionLifecycle,
  SessionStatus as AHPSessionStatus,
  chatReducer as ahpChatReducer,
  sessionReducer as ahpSessionReducer,
} from "@microsoft/agent-host-protocol";
import type {
  ActionOrigin as AHPActionOrigin,
  ChatAction as AHPChatAction,
  ChatSummary as AHPChatSummary,
  SessionChatUpdatedAction as AHPSessionChatUpdatedAction,
  SessionAction as AHPSessionAction,
} from "@microsoft/agent-host-protocol";
import { chatUri, sessionUri } from "../protocol";
import type { CreateSessionOptions, SessionPublication } from "../types";
import type { SessionRecord } from "./db/schema";

export function initialRecord(options: CreateSessionOptions, cwd: string): SessionRecord {
  if (!cwd.startsWith("/")) {
    throw new Error("Working directory must be an absolute path");
  }

  const path = cwd
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const now = options.createdAt;

  const summary = {
    provider: options.provider,
    title: "New session",
    status: AHPSessionStatus.Idle,
    createdAt: now,
    modifiedAt: now,
    workingDirectories: [new URL(path, "file:///").href],
  };

  const chat: AHPChatSummary = {
    resource: chatUri(options.chatId),
    title: summary.title,
    status: summary.status,
    modifiedAt: now,
  };

  return {
    id: options.sessionId,
    hostId: options.hostId,
    acpSessionId: null,
    summary,
    revision: 0,
    chatState: { ...chat, turns: [] },
    sessionState: {
      provider: summary.provider,
      title: summary.title,
      status: summary.status,
      workingDirectories: summary.workingDirectories,
      lifecycle: AHPSessionLifecycle.Creating,
      chats: [chat],
      defaultChat: chat.resource,
      activeClients: [],
    },
  };
}

export function applyChat(
  record: SessionRecord,
  action: AHPChatAction,
  origin?: AHPActionOrigin,
): SessionPublication {
  record.chatState = ahpChatReducer(record.chatState, action);
  record.revision += 1;
  const chat = record.chatState;

  const changes = {
    title: chat.title,
    status: chat.status,
    modifiedAt: chat.modifiedAt,
  };

  const sessionAction: AHPSessionChatUpdatedAction = {
    type: AHPActionType.SessionChatUpdated,
    chat: chat.resource,
    changes,
  };

  record.sessionState = ahpSessionReducer(record.sessionState, sessionAction);
  record.summary = { ...record.summary, status: chat.status, modifiedAt: chat.modifiedAt };

  return {
    sessionId: record.id,
    revision: record.revision,
    summary: record.summary,
    actions: [
      { channel: chat.resource, action, origin },
      { channel: sessionUri(record.id), action: sessionAction },
    ],
  };
}

export function applySession(record: SessionRecord, action: AHPSessionAction): SessionPublication {
  record.sessionState = ahpSessionReducer(record.sessionState, action);
  record.revision += 1;

  return {
    sessionId: record.id,
    revision: record.revision,
    summary: record.summary,
    actions: [{ channel: sessionUri(record.id), action }],
  };
}
