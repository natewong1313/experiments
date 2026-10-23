import type { ChatState as AHPChatState } from "@microsoft/agent-host-protocol";

const NEWEST_TURN = -1;

/**
 * The host selects a model before it starts a turn, so the newest turn identifies the session model.
 * If neither the active nor the newest completed turn specifies a model, the caller chooses a display fallback.
 */
export function chatModel(state: AHPChatState | undefined): string | undefined {
  return state?.activeTurn?.message.model?.id ?? state?.turns.at(NEWEST_TURN)?.message.model?.id;
}
