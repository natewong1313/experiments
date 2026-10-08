import { List as list, Map as keyedMap, type List, type Map } from "immutable";
import type {
  Snapshot,
  StateAction as SdkAction,
  ChatState as SdkChatState,
  ChatAction as SdkChatAction,
  SessionState as SdkSessionState,
  SessionAction as SdkSessionAction,
} from "@microsoft/agent-host-protocol";
import { chatReducer, sessionReducer } from "@microsoft/agent-host-protocol";
import {
  ChatActionSchema,
  ChatStateSchema,
  SessionActionSchema,
  SessionStateSchema,
  type ChatState,
  type ChatAction,
  type SessionState,
  type ActiveTurn,
  type Turn,
  type ResponsePart,
} from "@experiments/protocol-schemas/ahp";

const NO_PARTS = 0;

const ONE_PART = 1;

const ACTIVITY_MASK = 31;

const INPUT_NEEDED = 24;

const IN_PROGRESS = 8;

export type IndexedTurn = Omit<Turn, "responseParts"> & { responseParts: List<ResponsePart> };

export type IndexedActiveTurn = Omit<ActiveTurn, "responseParts"> & {
  responseParts: List<ResponsePart>;
  identities: Map<string, List<number>>;
  blocking: number;
};

export type ClientChatState = Omit<ChatState, "activeTurn" | "turns"> & {
  activeTurn?: IndexedActiveTurn;
  turns: IndexedTurn[];
};

function identity(part: ResponsePart): string | undefined {
  if (part.kind === "toolCall") {
    return part.toolCall.toolCallId;
  }

  return "id" in part ? part.id : void NO_PARTS;
}

function blocking(part: ResponsePart): number {
  if (part.kind === "inputRequest") {
    return part.response === void NO_PARTS ? ONE_PART : NO_PARTS;
  }

  return part.kind === "toolCall" &&
    (part.toolCall.status === "pending-confirmation" ||
      part.toolCall.status === "pending-result-confirmation" ||
      part.toolCall.status === "auth-required")
    ? ONE_PART
    : NO_PARTS;
}

function append(turn: IndexedActiveTurn, part: ResponsePart): IndexedActiveTurn {
  const id = identity(part);

  const positions =
    id === void NO_PARTS
      ? turn.identities
      : turn.identities.set(
          id,
          (turn.identities.get(id) ?? list<number>()).push(turn.responseParts.size),
        );

  return {
    ...turn,
    responseParts: turn.responseParts.push(part),
    identities: positions,
    blocking: turn.blocking + blocking(part),
  };
}

function indexState(state: ChatState): ClientChatState {
  let activeTurn: IndexedActiveTurn | undefined;

  if (state.activeTurn) {
    activeTurn = {
      ...state.activeTurn,
      responseParts: list<ResponsePart>(),
      identities: keyedMap<string, List<number>>(),
      blocking: NO_PARTS,
    };

    for (const part of state.activeTurn.responseParts) {
      activeTurn = append(activeTurn, part);
    }
  }

  return {
    ...state,
    activeTurn,
    turns: state.turns.map((turn) => ({ ...turn, responseParts: list(turn.responseParts) })),
  };
}

export function parseChat(value: Snapshot["state"] | ChatState): ClientChatState {
  return indexState(ChatStateSchema.parse(value));
}

export function wireState(state: ClientChatState): ChatState {
  const active = state.activeTurn;

  return {
    ...state,
    activeTurn: active
      ? {
          id: active.id,
          startedAt: active.startedAt,
          message: active.message,
          usage: active.usage,
          responseParts: active.responseParts.toArray(),
        }
      : void NO_PARTS,
    turns: state.turns.map((turn) => ({ ...turn, responseParts: turn.responseParts.toArray() })),
  };
}

export function reduceSession(state: SessionState, action: SdkAction): SessionState {
  // SAFETY: The wire schema validates the state before the SDK reducer reads its nominal enum fields.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkState = SessionStateSchema.parse(state) as SdkSessionState;

  // SAFETY: The channel action schema validates the SDK reducer's supported wire variants.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkAction = SessionActionSchema.parse(action) as SdkSessionAction;

  return SessionStateSchema.parse(sessionReducer(sdkState, sdkAction));
}

function reduceSelected(
  state: ChatState,
  action: ReturnType<typeof ChatActionSchema.parse>,
): ChatState {
  // SAFETY: This state is assembled from validated snapshots and actions using the SDK's wire enums.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkState = state as SdkChatState;

  // SAFETY: The channel action schema validates the SDK reducer's supported wire variants.
  // oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
  const sdkAction = action as SdkChatAction;

  return chatReducer(sdkState, sdkAction);
}

export function reduceChat(
  state: ClientChatState,
  incoming: SdkAction | ChatAction,
): ClientChatState {
  const action = ChatActionSchema.parse(incoming);
  const active = state.activeTurn;

  if (!active || !("turnId" in action) || action.turnId !== active.id) {
    const next = reduceSelected(wireState(state), action);

    return indexState(next);
  }

  if (action.type === "chat/responsePart") {
    return action.part.kind === "error"
      ? state
      : { ...state, activeTurn: append(active, action.part) };
  }

  if (action.type === "chat/toolCallStart") {
    const selected: ChatState = {
      ...state,
      turns: [],
      activeTurn: { ...active, responseParts: [] },
    };

    const [part] = reduceSelected(selected, action).activeTurn?.responseParts ?? [];

    return part ? { ...state, activeTurn: append(active, part) } : state;
  }

  if (action.type === "chat/usage") {
    return { ...state, activeTurn: { ...active, usage: action.usage } };
  }

  if (!("toolCallId" in action) && !("partId" in action)) {
    const next = reduceSelected(wireState(state), action);

    return indexState(next);
  }

  const id = "toolCallId" in action ? action.toolCallId : action.partId;
  const matches = active.identities.get(id) ?? list<number>();

  const positions =
    "partId" in action
      ? matches.take(ONE_PART)
      : matches.filter((position) => active.responseParts.get(position)?.kind === "toolCall");

  const parts = positions
    .map((position) => active.responseParts.get(position))
    .filter((part): part is ResponsePart => part !== void NO_PARTS)
    .toArray();

  const selected: ChatState = {
    ...state,
    turns: [],
    activeTurn: { ...active, responseParts: parts },
  };

  const next = reduceSelected(selected, action);
  let { responseParts } = active;
  let blocked = active.blocking;

  for (const [index, position] of positions.entries()) {
    const previous = responseParts.get(position);
    const part = next.activeTurn?.responseParts[index];

    if (part && previous) {
      responseParts = responseParts.set(position, part);
      blocked += blocking(part) - blocking(previous);
    }
  }

  const refresh =
    "toolCallId" in action &&
    action.type !== "chat/toolCallDelta" &&
    action.type !== "chat/toolCallContentChanged";

  const status = refresh
    ? (state.status & ~ACTIVITY_MASK) | (blocked > NO_PARTS ? INPUT_NEEDED : IN_PROGRESS)
    : state.status;

  return { ...state, status, activeTurn: { ...active, responseParts, blocking: blocked } };
}
