import { eq } from "drizzle-orm";
import {
  ActionType as AHPActionType,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
  chatReducer as ahpChatReducer,
} from "@microsoft/agent-host-protocol";
import type {
  ActiveTurn as AHPActiveTurn,
  ChatAction as AHPChatAction,
  ChatState as AHPChatState,
  ChatSummary as AHPChatSummary,
  ChatTruncatedAction as AHPChatTruncatedAction,
  ChatTurnsLoadedAction as AHPChatTurnsLoadedAction,
  Turn as AHPTurn,
} from "@microsoft/agent-host-protocol";
import { AHPError } from "../../shared/protocol";
import type { SessionDatabaseOrm } from "../db/database";
import { chatsTable } from "../db/schema";
import type { ChatMetadata, ChatRecord } from "../db/schema";
import { TurnRows, UNLOADED_MESSAGE } from "./turn-rows";
import type { LoadedPart, PartSelection, TurnHeader } from "./turn-rows";

/** The number of older turns that one `fetchTurns` call loads. */
export const FETCH_TURNS_PAGE = 50;

export type NewChat = { summary: AHPChatSummary; metadata: ChatMetadata };

/** Returns true if a router subscribes to the chat channel. */
export type HasSubscribers = (chat: string) => boolean;

/**
 * The actions are in publication order. History loads precede actions that need older turns.
 * Truncation can add a final history action to update the cursor. When present, `changes`
 * contains only changed summary fields.
 */
export type ChatChange = { actions: AHPChatAction[]; changes?: Partial<AHPChatSummary> };

/** A turn as a reducer input: its header and the parts that the action can change. */
type ReducerTurn = { header: TurnHeader; parts: LoadedPart[] };

type ReducerRun = {
  before: AHPChatState;
  after: AHPChatState;
  active?: ReducerTurn;
  resumed?: ReducerTurn;
};

/** The loaded-history window of a chat while it has subscribers. */
type HistoryWindow = { id: string; start: number };

const SUMMARY_KEYS = [
  "title",
  "status",
  "activity",
  "modifiedAt",
  "origin",
  "interactivity",
  "workingDirectories",
] as const satisfies readonly (keyof AHPChatSummary)[];

const CURSOR_SEPARATOR = ".";
const LAST = -1;

// These actions do not read or change existing parts or the chat status.
// Their reducer input omits active-turn parts.
const PARTLESS_ACTIONS: ReadonlySet<AHPChatAction["type"]> = new Set([
  AHPActionType.ChatResponsePart,
  AHPActionType.ChatToolCallStart,
  AHPActionType.ChatUsage,
  AHPActionType.ChatActivityChanged,
  AHPActionType.ChatDraftChanged,
  AHPActionType.ChatPendingMessageSet,
  AHPActionType.ChatPendingMessageRemoved,
  AHPActionType.ChatQueuedMessagesReordered,
  AHPActionType.ChatWorkingDirectorySet,
  AHPActionType.ChatWorkingDirectoryRemoved,
]);

/**
 * Stores the chats of a session: one row of summary fields and metadata for each chat, and its
 * turns, response parts, and text segments.
 *
 * Reducer input contains the chat fields and selected active-turn parts. The store selects
 * parts that the action can address or that affect chat status. It writes only changed parts
 * without reading stored streamed text. Ordinary changes do not load history. Resume and
 * truncation can first load older turns for subscribers.
 *
 * All subscribers of a chat share one window of loaded history. A subscription or a
 * `fetchTurns` call can make the window larger. The window ends when the chat has no
 * subscribers, and the next subscription starts a new one.
 */
export class ChatStore {
  private orm: SessionDatabaseOrm;
  private turns: TurnRows;
  private hasSubscribers: HasSubscribers;
  private statusWrites = 0;

  constructor(orm: SessionDatabaseOrm, hasSubscribers: HasSubscribers) {
    this.orm = orm;
    this.turns = new TurnRows(orm);
    this.hasSubscribers = hasSubscribers;
  }

  /**
   * The number of writes that changed the status of a chat.
   */
  get statusChanges(): number {
    return this.statusWrites;
  }

  insert(chat: NewChat): void {
    this.orm
      .insert(chatsTable)
      .values({ resource: chat.summary.resource, ...chat })
      .run();
  }

  summaries(): AHPChatSummary[] {
    return this.orm
      .select({ summary: chatsTable.summary })
      .from(chatsTable)
      .all()
      .map((row) => row.summary);
  }

  summary(chat: string): AHPChatSummary {
    const row = this.orm
      .select({ summary: chatsTable.summary })
      .from(chatsTable)
      .where(eq(chatsTable.resource, chat))
      .get();

    if (!row) {
      throw new Error("Chat does not exist");
    }

    return row.summary;
  }

  /** Returns the AHP ID of the active turn, or undefined if no turn is active. */
  activeTurnId(chat: string): string | undefined {
    const { activeTurn } = this.require(chat);

    return activeTurn === null ? undefined : this.turns.header(activeTurn)?.turnId;
  }

  /** Returns true if the chat has a turn with the AHP turn ID, active or ended. */
  hasTurn(chat: string, turnId: string): boolean {
    return this.turns.lookup(chat, turnId) !== undefined;
  }

  /** Applies a chat action and returns the actions to publish. */
  apply(chat: string, action: AHPChatAction): ChatChange {
    const row = this.require(chat);

    if (action.type === AHPActionType.ChatTruncated) {
      return this.truncate(row, action);
    }

    if (action.type === AHPActionType.ChatTurnsLoaded) {
      throw new Error("The store loads turns itself");
    }

    return this.runReducer(row, action);
  }

  /**
   * Returns the chat state with the turns of the window. A chat without subscribers has no
   * window, so the state has all turns.
   */
  snapshot(chat: string): AHPChatState {
    const row = this.require(chat);
    const window = this.window(row);
    const start = window?.start ?? 0;
    const { turns, activeTurn } = this.turns.load(chat, start);
    const state: AHPChatState = { ...row.summary, ...row.metadata, turns, activeTurn };
    const cursor = window && this.cursor(chat, window.id, start);

    if (cursor !== undefined) {
      state.turnsNextCursor = cursor;
    }

    return state;
  }

  /**
   * Starts or widens the window to include `recent` ended turns for a new subscriber.
   * If `recent` is undefined, the window includes all turns. Call this before storing the
   * subscription. If the window expands, the returned action loads the added turns for
   * existing subscribers.
   */
  openWindow(chat: string, recent: number | undefined): AHPChatTurnsLoadedAction | undefined {
    const row = this.require(chat);
    const start = recent === undefined ? 0 : this.recentStart(chat, recent);
    const window = this.window(row);

    if (!window) {
      this.startWindow(chat, start);

      return;
    }

    return start < window.start ? this.widen(chat, window, start) : undefined;
  }

  /**
   * Loads up to `FETCH_TURNS_PAGE` older turns into the window. Returns the action that loads
   * them, or undefined if the window already has the page of `cursor` or no older turns remain.
   *
   * A cursor holds the window ID and the window start when the session gave it out. The window
   * only moves to earlier starts, so a cursor with an earlier start than the window is unknown.
   *
   * @throws {AHPError} With the `InvalidParams` code if `cursor` is unknown or of another window.
   */
  fetchTurns(chat: string, cursor?: string): AHPChatTurnsLoadedAction | undefined {
    const row = this.require(chat);
    const window = this.window(row);

    if (cursor !== undefined) {
      const boundary = parseCursor(cursor);

      if (!window || boundary?.id !== window.id || boundary.start < window.start) {
        throw new AHPError("Unknown turns cursor", AHPJsonRpcErrorCodes.InvalidParams);
      }

      // The window has already expanded past this cursor. A retry loads nothing.
      if (boundary.start > window.start) {
        return;
      }
    }

    if (!window) {
      return;
    }

    const start = this.turns.pageStart(chat, window.start, FETCH_TURNS_PAGE);

    return start === undefined ? undefined : this.widen(chat, window, start);
  }

  /** Runs the AHP chat reducer on the rows that the action needs, and writes the result. */
  private runReducer(row: ChatRecord, action: AHPChatAction): ChatChange {
    const actions: AHPChatAction[] = [];

    const resumed =
      action.type === AHPActionType.ChatTurnResume && row.activeTurn === null
        ? this.resumable(row, actions)
        : undefined;

    const active = row.activeTurn === null ? undefined : this.reducerTurn(row.activeTurn, action);

    const before: AHPChatState = {
      ...row.summary,
      ...row.metadata,
      turns: resumed ? [endedTurnInput(resumed)] : [],
      activeTurn: active && activeTurnInput(active),
    };

    const after = ahpChatReducer(before, action);
    this.writeTurns(row.resource, { before, after, active, resumed });
    actions.push(action);

    return { actions, changes: this.writeChat(row.resource, before, after) };
  }

  /**
   * Returns the last ended turn as a reducer input for `chat/turnResume`. Loads it into the
   * window first if the window does not have it, and adds that action to `actions`.
   */
  private resumable(row: ChatRecord, actions: AHPChatAction[]): ReducerTurn | undefined {
    const header = this.turns.lastEnded(row.resource);

    if (!header) {
      return;
    }

    const loaded = this.loadThrough(row, header.position);

    if (loaded) {
      actions.push(loaded);
    }

    const parts = this.turns.reducerParts(header.id, { kind: "pending", withLast: true });

    return { header, parts };
  }

  private reducerTurn(row: number, action: AHPChatAction): ReducerTurn {
    const header = this.turns.header(row);

    if (!header) {
      throw new Error("Active turn does not exist");
    }

    return { header, parts: this.turns.reducerParts(row, partsFor(action)) };
  }

  private writeTurns(chat: string, { before, after, active, resumed }: ReducerRun): void {
    const next = after.activeTurn;

    if (!active) {
      if (next) {
        this.startTurn(chat, next, resumed);
      }

      return;
    }

    if (!next) {
      this.endTurn(chat, active, after);

      return;
    }

    if (next.id !== active.header.turnId) {
      throw new Error("A turn is already active");
    }

    this.turns.writeParts(active.header.id, active.parts, next.responseParts);

    if (next.usage !== before.activeTurn?.usage) {
      this.turns.update(active.header.id, { usage: next.usage ?? null });
    }
  }

  /** Stores a turn that became active: a new turn, or the resumed turn. */
  private startTurn(chat: string, next: AHPActiveTurn, resumed: ReducerTurn | undefined): void {
    if (resumed?.header.turnId !== next.id) {
      this.setActiveTurn(chat, this.turns.insert(chat, next));

      return;
    }

    const { id } = resumed.header;
    this.turns.update(id, { state: "active", startedAt: next.startedAt, duration: null });
    this.setActiveTurn(chat, id);
  }

  /** Stores the end of the active turn. The reducer appended it to `after.turns`. */
  private endTurn(chat: string, active: ReducerTurn, after: AHPChatState): void {
    const ended = after.turns.at(LAST);

    if (ended?.id !== active.header.turnId) {
      throw new Error("The active turn did not end");
    }

    this.turns.writeParts(active.header.id, active.parts, ended.responseParts);

    this.turns.update(active.header.id, {
      state: ended.state,
      duration: ended.duration ?? null,
      usage: ended.usage ?? null,
    });

    this.setActiveTurn(chat, null);
  }

  /**
   * Truncation removes all turns or the turns after `action.turnId`, including the active turn.
   * The store first loads the retained turn into the window if needed. A new window ID
   * invalidates old cursors. Subscribers receive the updated cursor.
   */
  private truncate(row: ChatRecord, action: AHPChatTruncatedAction): ChatChange {
    const actions: AHPChatAction[] = [];
    const chat = row.resource;
    let from = 0;

    if (action.turnId !== undefined) {
      const kept = this.turns.lookup(chat, action.turnId);

      if (!kept || kept.state === "active") {
        return { actions: [action] };
      }

      const loaded = this.loadThrough(row, kept.position);

      if (loaded) {
        actions.push(loaded);
      }

      from = kept.position + 1;
    }

    this.setActiveTurn(chat, null);
    this.turns.deleteFrom(chat, from);
    actions.push(action);

    const before: AHPChatState = { ...row.summary, ...row.metadata, turns: [] };
    const changes = this.writeChat(chat, before, ahpChatReducer(before, { type: action.type }));
    const window = this.window(this.require(chat));

    if (window) {
      // New turns after a full truncation start again at position 0.
      const renewed = this.startWindow(chat, action.turnId === undefined ? 0 : window.start);

      // Without a kept turn, the reducer clears the cursor.
      if (action.turnId !== undefined) {
        const cursor = this.cursor(chat, renewed.id, renewed.start);
        actions.push({ type: AHPActionType.ChatTurnsLoaded, turns: [], turnsNextCursor: cursor });
      }
    }

    return { actions, changes };
  }

  /** Loads the turns from `position` into the window if the window starts after it. */
  private loadThrough(row: ChatRecord, position: number): AHPChatTurnsLoadedAction | undefined {
    const window = this.window(row);

    return window && position < window.start
      ? this.widen(row.resource, window, position)
      : undefined;
  }

  /** Moves the start of the window to `start` and returns the action that loads the turns. */
  private widen(chat: string, window: HistoryWindow, start: number): AHPChatTurnsLoadedAction {
    const { turns } = this.turns.load(chat, start, window.start);
    this.moveWindow(chat, window.id, start);

    return {
      type: AHPActionType.ChatTurnsLoaded,
      turns,
      turnsNextCursor: this.cursor(chat, window.id, start),
    };
  }

  /**
   * Returns the window start that holds the `recent` most recent ended turns. With 0, the
   * window starts after the last ended turn.
   */
  private recentStart(chat: string, recent: number): number {
    if (recent === 0) {
      const last = this.turns.lastEnded(chat);

      return last ? last.position + 1 : 0;
    }

    return this.turns.endedPosition(chat, recent - 1) ?? 0;
  }

  /** Returns the cursor of a window start, or undefined if no ended turn is before it. */
  private cursor(chat: string, id: string, start: number): string | undefined {
    return this.turns.hasEndedBefore(chat, start) ? formatCursor({ id, start }) : undefined;
  }

  /** Returns the window of a chat, or undefined if it has none or no subscribers. */
  private window(row: ChatRecord): HistoryWindow | undefined {
    if (row.windowId === null || !this.hasSubscribers(row.resource)) {
      return;
    }

    return { id: row.windowId, start: row.windowStart };
  }

  /**
   * Writes the chat fields that the reducer changed. Returns the changed summary fields, or
   * undefined if none changed.
   */
  private writeChat(
    chat: string,
    before: AHPChatState,
    after: AHPChatState,
  ): Partial<AHPChatSummary> | undefined {
    const changes: Partial<AHPChatSummary> = {};
    const summary = summaryOf(after);

    for (const key of SUMMARY_KEYS) {
      if (before[key] !== after[key]) {
        Object.assign(changes, { [key]: summary[key] });
      }
    }

    const metadata = metadataOf(after);
    const metadataChanged = !sameFields(metadataOf(before), metadata);
    const summaryChanged = Object.keys(changes).length > 0;

    if (Object.hasOwn(changes, "status")) {
      this.statusWrites += 1;
    }

    if (summaryChanged) {
      this.orm.update(chatsTable).set({ summary }).where(eq(chatsTable.resource, chat)).run();
    }

    if (metadataChanged) {
      this.orm.update(chatsTable).set({ metadata }).where(eq(chatsTable.resource, chat)).run();
    }

    return summaryChanged ? changes : undefined;
  }

  private setActiveTurn(chat: string, activeTurn: number | null): void {
    this.orm.update(chatsTable).set({ activeTurn }).where(eq(chatsTable.resource, chat)).run();
  }

  /** Starts a window with a new ID and invalidates the cursors of the old window. */
  private startWindow(chat: string, start: number): HistoryWindow {
    const window = { id: crypto.randomUUID(), start };
    this.moveWindow(chat, window.id, start);

    return window;
  }

  private moveWindow(chat: string, id: string, start: number): void {
    this.orm
      .update(chatsTable)
      .set({ windowId: id, windowStart: start })
      .where(eq(chatsTable.resource, chat))
      .run();
  }

  private require(chat: string): ChatRecord {
    const row = this.orm.select().from(chatsTable).where(eq(chatsTable.resource, chat)).get();

    if (!row) {
      throw new Error("Chat does not exist");
    }

    return row;
  }
}

function activeTurnInput({ header, parts }: ReducerTurn): AHPActiveTurn {
  return {
    id: header.turnId,
    startedAt: header.startedAt ?? "",
    message: UNLOADED_MESSAGE,
    responseParts: parts.map((loaded) => loaded.part),
    usage: header.usage ?? undefined,
  };
}

function endedTurnInput({ header, parts }: ReducerTurn): AHPTurn {
  if (header.state === "active") {
    throw new Error("Turn is active");
  }

  const turn: AHPTurn = {
    id: header.turnId,
    message: UNLOADED_MESSAGE,
    responseParts: parts.map((loaded) => loaded.part),
    usage: header.usage ?? undefined,
    state: header.state,
  };

  if (header.startedAt !== null) {
    turn.startedAt = header.startedAt;
  }

  return turn;
}

function summaryOf(state: AHPChatState): AHPChatSummary {
  const {
    resource,
    title,
    status,
    activity,
    modifiedAt,
    origin,
    interactivity,
    workingDirectories,
  } = state;

  return {
    resource,
    title,
    status,
    activity,
    modifiedAt,
    origin,
    interactivity,
    workingDirectories,
  };
}

function metadataOf(state: AHPChatState): ChatMetadata {
  const {
    resource: _resource,
    title: _title,
    status: _status,
    activity: _activity,
    modifiedAt: _modifiedAt,
    origin: _origin,
    interactivity: _interactivity,
    workingDirectories: _workingDirectories,
    turns: _turns,
    activeTurn: _activeTurn,
    turnsNextCursor: _turnsNextCursor,
    ...metadata
  } = state;

  return metadata;
}

function sameFields(before: ChatMetadata, after: ChatMetadata): boolean {
  const previous = new Map(Object.entries(before));
  const next = Object.entries(after);

  return next.length === previous.size && next.every(([key, value]) => previous.get(key) === value);
}

function formatCursor({ id, start }: HistoryWindow): string {
  return `${id}${CURSOR_SEPARATOR}${start}`;
}

/**
 * Parses the window ID and start position from `cursor`.
 * Rejects an empty ID or a cursor that `formatCursor` cannot reproduce.
 */
function parseCursor(cursor: string): HistoryWindow | undefined {
  const index = cursor.lastIndexOf(CURSOR_SEPARATOR);
  const window = { id: cursor.slice(0, index), start: Number(cursor.slice(index + 1)) };

  return index > 0 && formatCursor(window) === cursor ? window : undefined;
}

/** Returns the parts of the active turn that the reducer needs for `action`. */
function partsFor(action: AHPChatAction): PartSelection {
  if (action.type === AHPActionType.ChatDelta || action.type === AHPActionType.ChatReasoning) {
    return { kind: "first", targetId: action.partId };
  }

  // These tool call actions change only matching tool calls, and keep the chat status.
  // The reducer ignores a matching tool call in another state.
  if (
    action.type === AHPActionType.ChatToolCallDelta ||
    action.type === AHPActionType.ChatToolCallContentChanged
  ) {
    return { kind: "targets", targetId: action.toolCallId };
  }

  // The other actions can set the chat status from all pending parts, or end the turn.
  return PARTLESS_ACTIONS.has(action.type)
    ? { kind: "none" }
    : { kind: "pending", withLast: false };
}
