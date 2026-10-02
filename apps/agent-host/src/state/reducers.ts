import {
  chatReducer,
  rootReducer,
  sessionReducer,
} from "@microsoft/agent-host-protocol";
import {
  ChatActionSchema,
  ChatStateSchema,
  RootActionSchema,
  RootStateSchema,
  SessionActionSchema,
  SessionStateSchema,
  type ChatState,
  type RootState,
  type SessionState,
  type StateAction,
} from "@experiments/protocol-schemas/ahp";

// The SDK uses nominal enums. The wire schemas validate their literal values.
function reduceRoot(state: RootState, action: StateAction): RootState {
  // SAFETY: RootStateSchema validates the wire-compatible fields before the SDK reducer reads them.
  const validatedState = state as Parameters<typeof rootReducer>[0];

  // SAFETY: RootActionSchema validates every root action variant before the SDK reducer reads it.
  const validatedAction = RootActionSchema.parse(action) as Parameters<
    typeof rootReducer
  >[1];

  return RootStateSchema.parse(rootReducer(validatedState, validatedAction));
}

function reduceSession(state: SessionState, action: StateAction): SessionState {
  // SAFETY: SessionStateSchema validates the wire-compatible fields before the SDK reducer reads them.
  const validatedState = state as Parameters<typeof sessionReducer>[0];

  // SAFETY: SessionActionSchema validates every session action variant before the SDK reducer reads it.
  const validatedAction = SessionActionSchema.parse(action) as Parameters<
    typeof sessionReducer
  >[1];

  return SessionStateSchema.parse(
    sessionReducer(validatedState, validatedAction),
  );
}

function reduceChat(state: ChatState, action: StateAction): ChatState {
  // SAFETY: ChatStateSchema validates the wire-compatible fields before the SDK reducer reads them.
  const validatedState = state as Parameters<typeof chatReducer>[0];

  // SAFETY: ChatActionSchema validates every chat action variant before the SDK reducer reads it.
  const validatedAction = ChatActionSchema.parse(action) as Parameters<
    typeof chatReducer
  >[1];

  return ChatStateSchema.parse(chatReducer(validatedState, validatedAction));
}

export { reduceRoot, reduceSession, reduceChat };
