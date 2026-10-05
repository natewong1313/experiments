import type { IndexedActiveTurn, IndexedTurn } from "../../lib/ahp/state";

export type ConversationTurnParams = {
  turn: IndexedTurn | IndexedActiveTurn;
  streaming: boolean;
};
