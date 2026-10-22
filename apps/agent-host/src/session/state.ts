import {
  ActionType as AHPActionType,
  SessionLifecycle as AHPSessionLifecycle,
  SessionStatus as AHPSessionStatus,
  sessionReducer as ahpSessionReducer,
} from "@microsoft/agent-host-protocol";
import type {
  ActionOrigin as AHPActionOrigin,
  ChatAction as AHPChatAction,
  ChatSummary as AHPChatSummary,
  ChatTurnsLoadedAction as AHPChatTurnsLoadedAction,
  SessionAction as AHPSessionAction,
  SessionCreationFailedAction as AHPSessionCreationFailedAction,
  SessionReadyAction as AHPSessionReadyAction,
  SessionState as AHPSessionState,
  SessionSummary as AHPSessionSummary,
} from "@microsoft/agent-host-protocol";
import type { SessionEnvelope, SessionUpdate } from "../shared/rpc/router";
import type { SessionRecord } from "./db/schema";
import type { ChatStore, NewChat } from "./chat/store";
import { chatUri, sessionUri } from "../shared/lookups";

/** The values that a new session record starts from. */
export type NewSession = {
  sessionId: string;
  chatId: string;
  provider: string;
  createdAt: string;
  // The absolute path that the ACP session runs in.
  cwd: string;
};

/** The rows of a new session: the session record and its default chat. */
export type NewSessionRows = { session: SessionRecord; chat: NewChat };

export function buildSession(options: NewSession): NewSessionRows {
  const { cwd } = options;

  const path = cwd
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const summary: AHPChatSummary = {
    resource: chatUri(options.sessionId, options.chatId),
    title: "New session",
    status: AHPSessionStatus.Idle,
    modifiedAt: options.createdAt,
  };

  const session: SessionRecord = {
    id: options.sessionId,
    acpSessionId: null,
    cwd,
    createdAt: options.createdAt,
    revision: 0,
    syncedRevision: 0,
    creationAttempts: 0,
    disposing: false,
    sessionState: {
      provider: options.provider,
      title: summary.title,
      status: summary.status,
      workingDirectories: [new URL(path, "file:///").href],
      lifecycle: AHPSessionLifecycle.Creating,
      defaultChat: summary.resource,
      activeClients: [],
    },
  };

  return { session, chat: { summary, metadata: {} } };
}

// The catalog summary follows the default chat's status and modification time.
export function sessionSummary(record: SessionRecord, chat: AHPChatSummary): AHPSessionSummary {
  return {
    resource: sessionUri(record.id),
    provider: record.sessionState.provider,
    title: record.sessionState.title,
    status: chat.status,
    createdAt: record.createdAt,
    modifiedAt: chat.modifiedAt,
    workingDirectories: record.sessionState.workingDirectories,
  };
}

/** Returns the session state with the summaries of its chats. */
export function sessionState(record: SessionRecord, chats: ChatStore): AHPSessionState {
  return { ...record.sessionState, chats: chats.summaries() };
}

// The apply functions advance the record in place and return the update to push for it.
export function applyChat(
  record: SessionRecord,
  chats: ChatStore,
  action: AHPChatAction,
  origin?: AHPActionOrigin,
): SessionUpdate {
  const chat = record.sessionState.defaultChat;
  const { actions, changes } = chats.apply(chat, action);

  const envelopes: SessionEnvelope[] = actions.map((applied) => ({
    channel: chat,
    action: applied,
    origin: applied === action ? origin : undefined,
  }));

  // Text deltas do not change summary fields and publish no summary action.
  if (changes) {
    envelopes.push({ channel: sessionUri(record.id), action: summaryAction(chats, chat, changes) });
  }

  return advance(record, envelopes);
}

/**
 * Returns the session action for changed summary fields. JSON omits fields whose values are undefined.
 * `session/chatUpdated` keeps omitted fields. If a field is cleared, `session/chatAdded`
 * replaces the summary to remove it.
 */
function summaryAction(
  chats: ChatStore,
  chat: string,
  changes: Partial<AHPChatSummary>,
): AHPSessionAction {
  const summary = chats.summary(chat);

  if (Object.keys(changes).some((key) => !Object.hasOwn(summary, key))) {
    return { type: AHPActionType.SessionChatAdded, summary };
  }

  return { type: AHPActionType.SessionChatUpdated, chat, changes };
}

/** Loading history advances the session revision without changing chat summary fields. */
export function applyLoaded(
  record: SessionRecord,
  action: AHPChatTurnsLoadedAction,
): SessionUpdate {
  return advance(record, [{ channel: record.sessionState.defaultChat, action }]);
}

/**
 * Applies a lifecycle action without loading chats. The reducer does not read or change the
 * chat list for these actions.
 */
export function applySession(
  record: SessionRecord,
  action: AHPSessionReadyAction | AHPSessionCreationFailedAction,
): SessionUpdate {
  const { chats: _chats, ...state } = ahpSessionReducer(
    { ...record.sessionState, chats: [] },
    action,
  );

  record.sessionState = { ...state, defaultChat: record.sessionState.defaultChat };

  return advance(record, [{ channel: sessionUri(record.id), action }]);
}

function advance(record: SessionRecord, actions: SessionEnvelope[]): SessionUpdate {
  record.revision += 1;

  return { revision: record.revision, actions };
}
