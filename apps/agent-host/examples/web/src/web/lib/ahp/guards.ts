import type {
  ChatAction as AHPChatAction,
  ChatState as AHPChatState,
  RootAction as AHPRootAction,
  RootState as AHPRootState,
  SessionAction as AHPSessionAction,
  SessionState as AHPSessionState,
  Snapshot as AHPSnapshot,
  StateAction as AHPStateAction,
} from "@microsoft/agent-host-protocol";

const CHAT_PREFIX = "chat/";
const ROOT_PREFIX = "root/";
const SESSION_PREFIX = "session/";

/** Only root state includes the agent catalog. */
export function isRootState(state: AHPSnapshot["state"]): state is AHPRootState {
  return "agents" in state;
}

/** Action envelopes can contain actions for any channel. Root channel actions use the `root/` prefix. */
export function isRootAction(action: AHPStateAction): action is AHPRootAction {
  return action.type.startsWith(ROOT_PREFIX);
}

/** Only session state includes the chat catalog. */
export function isSessionState(state: AHPSnapshot["state"]): state is AHPSessionState {
  return "chats" in state;
}

/** Only chat state includes the turn list. */
export function isChatState(state: AHPSnapshot["state"]): state is AHPChatState {
  return "turns" in state;
}

/** Action envelopes can contain actions for any channel. Session channel actions use the `session/` prefix. */
export function isSessionAction(action: AHPStateAction): action is AHPSessionAction {
  return action.type.startsWith(SESSION_PREFIX);
}

/** Action envelopes can contain actions for any channel. Chat channel actions use the `chat/` prefix. */
export function isChatAction(action: AHPStateAction): action is AHPChatAction {
  return action.type.startsWith(CHAT_PREFIX);
}
