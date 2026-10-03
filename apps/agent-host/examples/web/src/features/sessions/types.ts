import type { ActiveTurn, Turn } from "@experiments/protocol-schemas/ahp";

export type ConversationTurnParams = {
  turn: Turn | ActiveTurn;
  streaming: boolean;
};
