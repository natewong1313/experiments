import type {
  SessionState as SdkSessionState,
  SessionAction as SdkSessionAction,
  ChatState as SdkChatState,
  ChatAction as SdkChatAction,
  StateAction as SdkAction,
} from "@microsoft/agent-host-protocol";
import { chatReducer, sessionReducer } from "@microsoft/agent-host-protocol";
import {
  ChatActionSchema,
  ChatStateSchema,
  SessionActionSchema,
  SessionStateSchema,
  type ChatState,
  type SessionState,
} from "@experiments/protocol-schemas/ahp";

function reduceSession(state: SessionState, action: SdkAction): SessionState {
  // SAFETY: The wire schema validates the state before the SDK reducer reads its nominal enum fields.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkState = SessionStateSchema.parse(state) as SdkSessionState;

  // SAFETY: The channel action schema validates the SDK reducer's supported wire variants.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkAction = SessionActionSchema.parse(action) as SdkSessionAction;

  return SessionStateSchema.parse(sessionReducer(sdkState, sdkAction));
}

function reduceChat(state: ChatState, action: SdkAction): ChatState {
  // SAFETY: The wire schema validates the state before the SDK reducer reads its nominal enum fields.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkState = ChatStateSchema.parse(state) as SdkChatState;

  // SAFETY: The channel action schema validates the SDK reducer's supported wire variants.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkAction = ChatActionSchema.parse(action) as SdkChatAction;

  return ChatStateSchema.parse(chatReducer(sdkState, sdkAction));
}

export { reduceSession, reduceChat };
