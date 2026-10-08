import type {
  ActiveTurn,
  ChatAction,
  ChatErrorAction,
  ChatInputAnswerChangedAction,
  ChatInputCompletedAction,
  ChatInputRequestedAction,
  ChatState,
  ChatToolCallApprovedAction,
  ChatToolCallAuthRequiredAction,
  ChatToolCallAuthResolvedAction,
  ChatToolCallCompleteAction,
  ChatToolCallContentChangedAction,
  ChatToolCallDeltaAction,
  ChatToolCallDeniedAction,
  ChatToolCallReadyAction,
  ChatToolCallResultConfirmedAction,
  ChatToolCallStartAction,
  ChatTruncatedAction,
  ChatTurnCancelledAction,
  ChatTurnCompleteAction,
  ChatTurnResumeAction,
  ChatTurnsLoadedAction,
} from "@experiments/protocol-schemas/ahp";
import type { ChatStore } from "./chat-store";
import type { TurnStore } from "./turn-store";
import type { PartsStore } from "./parts-store";
import type { TurnHistory } from "./history";
import { reduceChat } from "../reducers";

const ACTIVITY_MASK = 31;
const INPUT_NEEDED = 24;
const IN_PROGRESS = 8;
const IDLE = 1;
const IS_READ = 32;

type ToolAction =
  | ChatToolCallStartAction
  | ChatToolCallDeltaAction
  | ChatToolCallReadyAction
  | ChatToolCallApprovedAction
  | ChatToolCallDeniedAction
  | ChatToolCallCompleteAction
  | ChatToolCallResultConfirmedAction
  | ChatToolCallContentChangedAction
  | ChatToolCallAuthRequiredAction
  | ChatToolCallAuthResolvedAction;

type InputAction =
  | ChatInputRequestedAction
  | ChatInputAnswerChangedAction
  | ChatInputCompletedAction;

type EndAction = ChatTurnCompleteAction | ChatTurnCancelledAction | ChatErrorAction;

type HistoryAction = ChatTurnResumeAction | ChatTruncatedAction | ChatTurnsLoadedAction;

type ChatTransitionsParams = {
  chats: ChatStore;
  turns: TurnStore;
  parts: PartsStore;
  history: TurnHistory;
};

export class ChatTransitions {
  private readonly chats: ChatStore;

  private readonly turns: TurnStore;
  private readonly parts: PartsStore;
  private readonly history: TurnHistory;

  constructor({ chats, turns, parts, history }: ChatTransitionsParams) {
    this.chats = chats;
    this.turns = turns;
    this.parts = parts;
    this.history = history;
  }

  createChat(uri: string, chat: ChatState): void {
    this.chats.createChat(uri, chat);
  }

  deleteChat(uri: string): void {
    this.history.deleteChatHistory(uri);
    this.turns.deleteTurnRecords(uri);
    this.chats.deleteChat(uri);
  }

  applyAction(uri: string, action: ChatAction): ChatState {
    const current = this.chats.readMetadata(uri);
    const active = current.activeTurn;

    if (
      action.type === "chat/turnResume" ||
      action.type === "chat/truncated" ||
      action.type === "chat/turnsLoaded"
    ) {
      return this.applyHistoryAction(uri, current, action);
    }

    if (action.type === "chat/turnStarted") {
      const next = reduceChat(current, action);

      if (active) {
        this.turns.deleteTurnRecords(uri, active.id);
      }

      if (next.activeTurn) {
        this.turns.insertTurn(uri, next.activeTurn);
      }

      this.chats.writeChatMetadata(uri, next);

      return next;
    }

    if (!active || ("turnId" in action && action.turnId !== active.id)) {
      const next = reduceChat(current, action);

      if (
        active &&
        "toolCallId" in action &&
        action.type !== "chat/toolCallDelta" &&
        action.type !== "chat/toolCallContentChanged"
      ) {
        this.refreshStatus(uri, next);
      }

      this.chats.writeChatMetadata(uri, next);

      return next;
    }

    if (
      action.type === "chat/turnComplete" ||
      action.type === "chat/turnCancelled" ||
      action.type === "chat/error"
    ) {
      return this.complete(uri, current, active, action);
    }

    if ("toolCallId" in action && action.type !== "chat/toolCallStart") {
      this.updateTool(uri, current, active, action);
    } else if (
      action.type === "chat/inputRequested" ||
      action.type === "chat/inputAnswerChanged" ||
      action.type === "chat/inputCompleted"
    ) {
      this.updateInput(uri, current, active, action);
    } else {
      this.updatePart(uri, current, active, action);
    }

    this.turns.checkTurnBudget(uri, active.id);
    this.chats.writeChatMetadata(uri, current);

    return this.chats.readMetadata(uri);
  }

  private updatePart(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: ChatAction,
  ): void {
    if (action.type === "chat/delta" || action.type === "chat/reasoning") {
      const [row] = this.parts.findByIdentity(uri, active.id, action.partId, true);
      const kind = action.type === "chat/delta" ? "markdown" : "reasoning";

      if (row?.kind === kind) {
        this.parts.appendText(uri, active.id, row, action.content);
      }

      return;
    }

    if (action.type === "chat/responsePart") {
      if (action.part.kind !== "error") {
        this.parts.insert(
          uri,
          active.id,
          this.turns.readTurnRecord(uri, active.id).partCount,
          action.part,
        );
      }

      return;
    }

    const next = reduceChat(current, action);

    if (action.type === "chat/toolCallStart") {
      const part = next.activeTurn?.responseParts[0];

      if (part) {
        this.parts.insert(
          uri,
          active.id,
          this.turns.readTurnRecord(uri, active.id).partCount,
          part,
        );
      }
    } else if (action.type === "chat/usage" && next.activeTurn) {
      this.turns.writeTurnMetadata(uri, active.id, next.activeTurn);
    } else {
      Object.assign(current, next);
    }
  }

  private updateTool(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: ToolAction,
  ): void {
    const rows = this.parts
      .findByIdentity(uri, active.id, action.toolCallId)
      .filter((row) => row.kind === "toolCall");

    const selected = {
      ...current,
      activeTurn: {
        ...active,
        responseParts: rows.map((row) => this.parts.parseMetadata(row)),
      },
    };

    const next = reduceChat(selected, action);

    for (const [index, row] of rows.entries()) {
      const part = next.activeTurn?.responseParts[index];

      if (part && part !== selected.activeTurn.responseParts[index]) {
        this.parts.replace(uri, active.id, row, part);
      }
    }

    if (action.type !== "chat/toolCallDelta" && action.type !== "chat/toolCallContentChanged") {
      this.refreshStatus(uri, current);
    }
  }

  private updateInput(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: InputAction,
  ): void {
    const identity = action.type === "chat/inputRequested" ? action.request.id : action.requestId;

    const row = this.parts.findByIdentity(uri, active.id, identity).find((item) => {
      const part = this.parts.parseMetadata(item);

      return part.kind === "inputRequest" && part.response === void 0;
    });

    const selected = {
      ...current,
      activeTurn: { ...active, responseParts: row ? [this.parts.parseMetadata(row)] : [] },
    };

    const next = reduceChat(selected, action);
    const part = next.activeTurn?.responseParts[0];

    if (part) {
      if (row) {
        this.parts.replace(uri, active.id, row, part);
      } else {
        this.parts.insert(
          uri,
          active.id,
          this.turns.readTurnRecord(uri, active.id).partCount,
          part,
        );
      }
    }

    if (action.type !== "chat/inputAnswerChanged") {
      this.refreshStatus(uri, current);

      if (action.type === "chat/inputRequested") {
        current.status &= ~IS_READ;
      }
    }
  }

  private refreshStatus(uri: string, chat: ChatState): void {
    const active = chat.activeTurn;

    if (!active) {
      return;
    }

    const turn = this.turns.readTurnRecord(uri, active.id);
    chat.status =
      (chat.status & ~ACTIVITY_MASK) |
      (turn.blockingCount + turn.inputCount > 0 ? INPUT_NEEDED : IN_PROGRESS);
  }

  private complete(
    uri: string,
    current: ChatState,
    active: ActiveTurn,
    action: EndAction,
  ): ChatState {
    const rows = this.parts.readUnfinishedToolCalls(uri, active.id);

    const selected = {
      ...current,
      activeTurn: {
        ...active,
        responseParts: rows.map((row) => this.parts.parseMetadata(row)),
      },
    };

    const next = reduceChat(selected, action);
    const [finished] = next.turns;

    if (!finished) {
      return current;
    }

    for (const [index, row] of rows.entries()) {
      const part = finished.responseParts[index];

      if (part) {
        this.parts.replace(uri, active.id, row, part);
      }
    }

    if (action.type === "chat/error") {
      this.parts.insert(
        uri,
        active.id,
        this.turns.readTurnRecord(uri, active.id).partCount,
        action.part,
      );
    }

    this.turns.writeTurnMetadata(uri, active.id, { ...finished, responseParts: [] });
    this.history.addHistory(uri, active.id);
    const chat = { ...next, turns: [] };
    this.chats.writeChatMetadata(uri, chat);

    return chat;
  }

  private applyHistoryAction(uri: string, current: ChatState, action: HistoryAction): ChatState {
    if (action.type === "chat/turnsLoaded") {
      // History delivery is handled by fetchTurns, never applied to current records.
      return current;
    }

    if (action.type === "chat/turnResume") {
      if (current.activeTurn) {
        return current;
      }

      const latest = this.history.latestCompletedTurn(uri);

      if (latest?.turnId !== action.turnId) {
        return current;
      }

      const turn = this.turns.readWithOutput(uri, action.turnId);
      const reduced = reduceChat({ ...current, turns: [turn] }, action);

      if (!reduced.activeTurn) {
        return current;
      }

      const active = { ...reduced.activeTurn, responseParts: [] };

      this.turns.writeTurnMetadata(uri, active.id, active);
      this.history.removeHistory(uri, active.id);
      const next = { ...reduced, turns: [], activeTurn: active };
      this.refreshStatus(uri, next);
      this.chats.writeChatMetadata(uri, next);

      return next;
    }

    if (!this.history.deleteHistoryAfter(uri, action.turnId)) {
      return current;
    }

    if (current.activeTurn) {
      this.turns.deleteTurnRecords(uri, current.activeTurn.id);
    }

    const next = {
      ...current,
      activeTurn: void 0,
      status: (current.status & ~ACTIVITY_MASK) | IDLE,
    };

    if (action.turnId === void 0) {
      delete next.turnsNextCursor;
    }

    this.chats.writeChatMetadata(uri, next);

    return next;
  }
}
