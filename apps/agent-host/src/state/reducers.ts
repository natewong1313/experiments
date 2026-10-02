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
  const validatedState = state as Parameters<typeof rootReducer>[0];
  const validatedAction = RootActionSchema.parse(action) as Parameters<
    typeof rootReducer
  >[1];
  return RootStateSchema.parse(rootReducer(validatedState, validatedAction));
}

function reduceSession(state: SessionState, action: StateAction): SessionState {
  const validatedState = state as Parameters<typeof sessionReducer>[0];
  const validatedAction = SessionActionSchema.parse(action) as Parameters<
    typeof sessionReducer
  >[1];
  return SessionStateSchema.parse(
    sessionReducer(validatedState, validatedAction),
  );
}

function reduceChat(state: ChatState, action: StateAction): ChatState {
  const validatedState = state as Parameters<typeof chatReducer>[0];
  const validatedAction = ChatActionSchema.parse(action) as Parameters<
    typeof chatReducer
  >[1];
  return ChatStateSchema.parse(chatReducer(validatedState, validatedAction));
}

export { reduceRoot, reduceSession, reduceChat };
