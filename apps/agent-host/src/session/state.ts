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
import type { HostSessionUpdateRequest } from "../shared/rpc/host";
import type { SessionRecord } from "./db/schema";
import { chatUri, sessionUri } from "../shared/lookups";

// TODO: move this
export function buildSession(options: SessionCreateRequest, cwd: string): SessionRecord {
  const path = cwd
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const summary: AHPSessionSummary = {
    resource: sessionUri(options.sessionId),
    provider: options.provider,
    title: "New session",
    status: AHPSessionStatus.Idle,
    createdAt: options.createdAt,
    modifiedAt: options.createdAt,
    workingDirectories: [new URL(path, "file:///").href],
  };

  const chat: AHPChatSummary = {
    resource: chatUri(options.chatId),
    title: summary.title,
    status: summary.status,
    modifiedAt: options.createdAt,
  };

  const chatState: AHPChatState = {
    ...chat,
    turns: [],
  };

  const sessionState: AHPSessionState = {
    provider: summary.provider,
    title: summary.title,
    status: summary.status,
    workingDirectories: summary.workingDirectories,
    lifecycle: AHPSessionLifecycle.Creating,
    chats: [chat],
    defaultChat: chat.resource,
    activeClients: [],
  };

  return {
    id: options.sessionId,
    hostId: options.hostId,
    acpSessionId: null,
    summary,
    revision: 0,
    chatState,
    sessionState,
  };
}

export function applyChat(
  record: SessionRecord,
  action: AHPChatAction,
  origin?: AHPActionOrigin,
): HostSessionUpdateRequest {
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

export function applySession(
  record: SessionRecord,
  action: AHPSessionAction,
): HostSessionUpdateRequest {
  record.sessionState = ahpSessionReducer(record.sessionState, action);
  record.revision += 1;

  return {
    sessionId: record.id,
    revision: record.revision,
    summary: record.summary,
    actions: [{ channel: sessionUri(record.id), action }],
  };
}
