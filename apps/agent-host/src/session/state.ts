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
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
  ChatSummary as AHPChatSummary,
  SessionChatUpdatedAction as AHPSessionChatUpdatedAction,
  SessionAction as AHPSessionAction,
  SessionSummary as AHPSessionSummary,
} from "@microsoft/agent-host-protocol";
import type { SessionCreateRequest } from "../shared/rpc/session";
import type { SessionUpdate } from "../shared/rpc/router";
import type { SessionRecord } from "./db/schema";
import { chatUri, sessionUri } from "../shared/lookups";

export function buildSession(options: SessionCreateRequest, cwd: string): SessionRecord {
  const path = cwd
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const chat: AHPChatSummary = {
    resource: chatUri(options.sessionId, options.chatId),
    title: "New session",
    status: AHPSessionStatus.Idle,
    modifiedAt: options.createdAt,
  };

  const chatState: AHPChatState = {
    ...chat,
    turns: [],
  };

  const sessionState: AHPSessionState = {
    provider: options.provider,
    title: chat.title,
    status: chat.status,
    workingDirectories: [new URL(path, "file:///").href],
    lifecycle: AHPSessionLifecycle.Creating,
    chats: [chat],
    defaultChat: chat.resource,
    activeClients: [],
  };

  return {
    id: options.sessionId,
    hostId: options.hostId,
    acpSessionId: null,
    cwd,
    createdAt: options.createdAt,
    revision: 0,
    chatState,
    sessionState,
  };
}

// The catalog summary follows the default chat's status and modification time.
export function sessionSummary(record: SessionRecord): AHPSessionSummary {
  return {
    resource: sessionUri(record.id),
    provider: record.sessionState.provider,
    title: record.sessionState.title,
    status: record.chatState.status,
    createdAt: record.createdAt,
    modifiedAt: record.chatState.modifiedAt,
    workingDirectories: record.sessionState.workingDirectories,
  };
}

// The apply functions advance the record in place and return the update to push for it.
export function applyChat(
  record: SessionRecord,
  action: AHPChatAction,
  origin?: AHPActionOrigin,
): SessionUpdate {
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

  return {
    revision: record.revision,
    actions: [
      { channel: chat.resource, action, origin },
      { channel: sessionUri(record.id), action: sessionAction },
    ],
  };
}

export function applySession(record: SessionRecord, action: AHPSessionAction): SessionUpdate {
  record.sessionState = ahpSessionReducer(record.sessionState, action);
  record.revision += 1;

  return {
    revision: record.revision,
    actions: [{ channel: sessionUri(record.id), action }],
  };
}
