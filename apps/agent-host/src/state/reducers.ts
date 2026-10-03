import { chatReducer, rootReducer, sessionReducer } from "@microsoft/agent-host-protocol";
import type {
  ChatState,
  RootState,
  SessionState,
  StateAction,
} from "@experiments/protocol-schemas/ahp";

// External input is validated by the wire schemas before reaching these reducers.
function reduceRoot(state: RootState, action: StateAction): RootState {
  // SAFETY: Persisted state and validated actions use the SDK's wire values for nominal enums.
  const sdkState = state as Parameters<typeof rootReducer>[0];
  // SAFETY: Callers route validated root actions to this reducer.
  const sdkAction = action as Parameters<typeof rootReducer>[1];

  return rootReducer(sdkState, sdkAction);
}

function reduceSession(state: SessionState, action: StateAction): SessionState {
  // SAFETY: Persisted state and validated actions use the SDK's wire values for nominal enums.
  const sdkState = state as Parameters<typeof sessionReducer>[0];
  // SAFETY: Callers route validated session actions to this reducer.
  const sdkAction = action as Parameters<typeof sessionReducer>[1];

  return sessionReducer(sdkState, sdkAction);
}

function reduceChat(state: ChatState, action: StateAction): ChatState {
  // SAFETY: Persisted state and validated actions use the SDK's wire values for nominal enums.
  const sdkState = state as Parameters<typeof chatReducer>[0];
  // SAFETY: Callers route validated chat actions to this reducer.
  const sdkAction = action as Parameters<typeof chatReducer>[1];

  return chatReducer(sdkState, sdkAction);
}

export { reduceRoot, reduceSession, reduceChat };
