import {
  SessionStatus as AHPSessionStatus,
  type ChatState as AHPChatState,
} from "@microsoft/agent-host-protocol";

import { hasStatusFlag } from "./session-phase";

/**
 * AHP uses the `InputNeeded` status bit for tool confirmations and input requests,
 * not a separate turn state. Both map to `waiting`.
 */
export type AhpChatPhase = "idle" | "streaming" | "waiting" | "error";

/**
 * Status updates can arrive after the active turn. Treat an active turn as streaming
 * unless `InputNeeded` indicates that it is waiting.
 */
export function chatPhase(state: AHPChatState): AhpChatPhase {
  if (state.activeTurn === undefined) {
    return hasStatusFlag(state.status, AHPSessionStatus.Error) ? "error" : "idle";
  }

  return hasStatusFlag(state.status, AHPSessionStatus.InputNeeded) ? "waiting" : "streaming";
}
