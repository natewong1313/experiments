import { env } from "cloudflare:workers";
import { asc } from "drizzle-orm";
import { runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import {
  ActionType as AHPActionType,
  ChatInputAnswerState as AHPChatInputAnswerState,
  ChatInputAnswerValueKind as AHPChatInputAnswerValueKind,
  ChatInputResponseKind as AHPChatInputResponseKind,
  MessageKind as AHPMessageKind,
  PendingMessageKind as AHPPendingMessageKind,
  ResponsePartKind as AHPResponsePartKind,
  SessionStatus as AHPSessionStatus,
  ToolCallConfirmationReason as AHPToolCallConfirmationReason,
  ToolResultContentType as AHPToolResultContentType,
  chatReducer as ahpChatReducer,
} from "@microsoft/agent-host-protocol";
import type {
  ChatAction as AHPChatAction,
  ChatState as AHPChatState,
  ChatTurnStartedAction as AHPChatTurnStartedAction,
} from "@microsoft/agent-host-protocol";
import { SEGMENT_BYTES } from "../src/session/chat/text";
import { FETCH_TURNS_PAGE } from "../src/session/chat/store";
import type { ChatStore } from "../src/session/chat/store";
import { SessionDatabase } from "../src/session/db/database";
import { textSegmentsTable } from "../src/session/db/schema";
import type { SessionRecord } from "../src/session/db/schema";
import { SessionRecords } from "../src/session/records";
import { applyChat } from "../src/session/state";
import { sessionDOName } from "../src/shared/lookups";
import { newRecord } from "./fixtures";

/** A store over new session rows. The chats in `subscribed` have subscribers. */
type StoreTest = {
  db: SessionDatabase;
  records: SessionRecords;
  chats: ChatStore;
  chat: string;
  subscribed: Set<string>;
};

/** The state that a client gets from the published actions. */
type Reference = { state: AHPChatState };

const encoder = new TextEncoder();
const STARTED_AT = "2026-01-01T00:00:00.000Z";
const LARGE_TEXT_BYTES = 40_000;
const HISTORY_TURNS = 120;
const SHORT_HISTORY = 10;
// A segment with this many bytes left cannot hold a four-byte character.
const SMALL_GAP = 2;
const EMOJI_BYTES = 4;
const RECENT = 5;
const WIDER = 10;
const NARROWER = 3;
const FIRST_WINDOW = 2;
const SECOND_WINDOW = 4;
const KEPT = 4;
const LAST = -1;

/** Runs `test` in a new session object with stored session rows and no subscribers. */
async function withStore<Result>(test: (store: StoreTest) => Result): Promise<Result> {
  const name = sessionDOName(crypto.randomUUID(), crypto.randomUUID());

  return await runInDurableObject(env.CONVERSATIONS.getByName(name), async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);
    await db.migrate();
    const subscribed: Set<string> = new Set();
    const records = new SessionRecords(db, (chat) => subscribed.has(chat));
    const rows = newRecord();
    records.insertIfAbsent(() => rows);

    return test({
      db,
      records,
      chats: records.chats,
      chat: rows.chat.summary.resource,
      subscribed,
    });
  });
}

/**
 * Applies each action to the store and reduces the published actions with the AHP reducer.
 * The stored chat must match the reference state after each action.
 */
function applyBoth(store: StoreTest, reference: Reference, actions: AHPChatAction[]): void {
  for (const action of actions) {
    const before = reference.state;
    const change = store.chats.apply(store.chat, action);

    for (const applied of change.actions) {
      reference.state = ahpChatReducer(reference.state, applied);
    }

    expect(store.chats.snapshot(store.chat)).toEqual(reference.state);
    expect(change.changes).toEqual(summaryChanges(before, reference.state));
  }
}

function summaryChanges(
  before: AHPChatState,
  after: AHPChatState,
): Partial<AHPChatState> | undefined {
  const keys = ["title", "status", "activity", "modifiedAt"] as const;
  const changed = keys.filter((key) => before[key] !== after[key]);

  return changed.length > 0
    ? Object.fromEntries(changed.map((key) => [key, after[key]]))
    : undefined;
}

function turnStarted(turnId: string, text = "hello"): AHPChatTurnStartedAction {
  return {
    type: AHPActionType.ChatTurnStarted,
    turnId,
    startedAt: STARTED_AT,
    message: { text, origin: { kind: AHPMessageKind.User } },
  };
}

/** Returns text of about `bytes` UTF-8 bytes with one-, two-, three-, and four-byte characters. */
function mixedText(bytes: number): string {
  const unit = "aé€😀";
  const unitBytes = encoder.encode(unit).length;

  return unit.repeat(Math.ceil(bytes / unitBytes));
}

/** Stores `count` ended turns with one markdown part each. */
function storeHistory({ chats, chat }: StoreTest, count: number): string[] {
  const turnIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    turnIds.push(`turn-${index}`);
  }

  for (const turnId of turnIds) {
    chats.apply(chat, turnStarted(turnId, turnId));
    chats.apply(chat, {
      type: AHPActionType.ChatResponsePart,
      turnId,
      part: { kind: AHPResponsePartKind.Markdown, id: turnId, content: `answer ${turnId}` },
    });
    chats.apply(chat, { type: AHPActionType.ChatTurnComplete, turnId, duration: 1 });
  }

  return turnIds;
}

function addSubscriber({ subscribed, chat }: StoreTest): void {
  subscribed.add(chat);
}

it("matches the AHP reducer through tool calls, input requests, errors, and a resume", async () => {
  await withStore((store) => {
    const reference = { state: store.chats.snapshot(store.chat) };

    applyBoth(store, reference, [
      {
        type: AHPActionType.ChatDraftChanged,
        draft: { text: "draft", origin: { kind: AHPMessageKind.User } },
      },
      {
        type: AHPActionType.ChatPendingMessageSet,
        kind: AHPPendingMessageKind.Queued,
        id: "queued",
        message: { text: "later", origin: { kind: AHPMessageKind.User } },
      },
      { ...turnStarted("t1"), queuedMessageId: "queued" },
      { type: AHPActionType.ChatActivityChanged, activity: "Thinking" },
      {
        type: AHPActionType.ChatResponsePart,
        turnId: "t1",
        part: { kind: AHPResponsePartKind.Markdown, id: "m1", content: "Hi" },
      },
      { type: AHPActionType.ChatDelta, turnId: "t1", partId: "m1", content: " there" },
      // Two deltas split one surrogate pair.
      { type: AHPActionType.ChatDelta, turnId: "t1", partId: "m1", content: " \uD83D" },
      { type: AHPActionType.ChatDelta, turnId: "t1", partId: "m1", content: "\uDE00 " },
      {
        type: AHPActionType.ChatDelta,
        turnId: "t1",
        partId: "m1",
        content: mixedText(LARGE_TEXT_BYTES),
      },
      {
        type: AHPActionType.ChatResponsePart,
        turnId: "t1",
        part: { kind: AHPResponsePartKind.Reasoning, id: "r1", content: "" },
      },
      {
        type: AHPActionType.ChatReasoning,
        turnId: "t1",
        partId: "r1",
        content: mixedText(SEGMENT_BYTES),
      },
      {
        type: AHPActionType.ChatToolCallStart,
        turnId: "t1",
        toolCallId: "tc1",
        toolName: "read",
        displayName: "Read",
      },
      {
        type: AHPActionType.ChatToolCallDelta,
        turnId: "t1",
        toolCallId: "tc1",
        content: '{"path":"\uD83D',
        invocationMessage: "Reading",
      },
      {
        type: AHPActionType.ChatToolCallDelta,
        turnId: "t1",
        toolCallId: "tc1",
        content: '\uDE00"',
      },
      {
        type: AHPActionType.ChatToolCallDelta,
        turnId: "t1",
        toolCallId: "tc1",
        content: mixedText(LARGE_TEXT_BYTES),
      },
      // A delta that addresses a tool call by its ID changes nothing.
      { type: AHPActionType.ChatDelta, turnId: "t1", partId: "tc1", content: "ignored" },
      { type: AHPActionType.ChatDelta, turnId: "t1", partId: "missing", content: "ignored" },
      {
        type: AHPActionType.ChatToolCallReady,
        turnId: "t1",
        toolCallId: "tc1",
        invocationMessage: "Read a file",
        toolInput: '{"path":"a"}',
        confirmed: AHPToolCallConfirmationReason.NotNeeded,
      },
      {
        type: AHPActionType.ChatToolCallStart,
        turnId: "t1",
        toolCallId: "tc2",
        toolName: "write",
        displayName: "Write",
      },
      {
        type: AHPActionType.ChatToolCallReady,
        turnId: "t1",
        toolCallId: "tc2",
        invocationMessage: "Write a file",
      },
      {
        type: AHPActionType.ChatToolCallConfirmed,
        turnId: "t1",
        toolCallId: "tc2",
        approved: true,
        confirmed: AHPToolCallConfirmationReason.UserAction,
      },
      {
        type: AHPActionType.ChatToolCallContentChanged,
        turnId: "t1",
        toolCallId: "tc1",
        content: [{ type: AHPToolResultContentType.Text, text: "partial result" }],
      },
      { type: AHPActionType.ChatInputRequested, request: { id: "q1", message: "Which file?" } },
      {
        type: AHPActionType.ChatInputAnswerChanged,
        requestId: "q1",
        questionId: "file",
        answer: {
          state: AHPChatInputAnswerState.Draft,
          value: { kind: AHPChatInputAnswerValueKind.Text, value: "a" },
        },
      },
      {
        type: AHPActionType.ChatInputCompleted,
        requestId: "q1",
        response: AHPChatInputResponseKind.Accept,
      },
      { type: AHPActionType.ChatUsage, turnId: "t1", usage: { inputTokens: 10, outputTokens: 20 } },
      {
        type: AHPActionType.ChatToolCallComplete,
        turnId: "t1",
        toolCallId: "tc1",
        result: { success: true, pastTenseMessage: "Read a file" },
      },
      // The turn end cancels the running tool call `tc2`.
      { type: AHPActionType.ChatTurnComplete, turnId: "t1", duration: 1000 },
      turnStarted("t2"),
      {
        type: AHPActionType.ChatToolCallStart,
        turnId: "t2",
        toolCallId: "tc3",
        toolName: "run",
        displayName: "Run",
      },
      { type: AHPActionType.ChatToolCallDelta, turnId: "t2", toolCallId: "tc3", content: "{" },
      { type: AHPActionType.ChatTurnCancelled, turnId: "t2", duration: 5 },
      turnStarted("t3"),
      {
        type: AHPActionType.ChatResponsePart,
        turnId: "t3",
        part: { kind: AHPResponsePartKind.Markdown, id: "m3", content: "Before" },
      },
      {
        type: AHPActionType.ChatError,
        turnId: "t3",
        duration: 10,
        part: {
          kind: AHPResponsePartKind.Error,
          error: { errorType: "agent", message: "Lost" },
          resumable: true,
        },
      },
      { type: AHPActionType.ChatTurnResume, turnId: "t3" },
      { type: AHPActionType.ChatDelta, turnId: "t3", partId: "m3", content: " after" },
      { type: AHPActionType.ChatTurnComplete, turnId: "t3", duration: 20 },
      // Late output does not reopen an ended turn.
      { type: AHPActionType.ChatDelta, turnId: "t3", partId: "m3", content: " late" },
    ]);

    expect(reference.state.status).toBe(AHPSessionStatus.Idle);
    expect(reference.state.turns.map((turn) => turn.state)).toEqual([
      "complete",
      "cancelled",
      "complete",
    ]);
  });
});

it("splits streamed text into segments of at most 16 KiB at code point boundaries", async () => {
  await withStore((store) => {
    const { db, chats, chat } = store;

    function segments(): { text: string; bytes: number }[] {
      return db.orm
        .select({ text: textSegmentsTable.text, bytes: textSegmentsTable.bytes })
        .from(textSegmentsTable)
        .orderBy(asc(textSegmentsTable.part), asc(textSegmentsTable.position))
        .all();
    }

    chats.apply(chat, turnStarted("t1"));
    chats.apply(chat, {
      type: AHPActionType.ChatResponsePart,
      turnId: "t1",
      part: {
        kind: AHPResponsePartKind.Markdown,
        id: "m1",
        content: "a".repeat(SEGMENT_BYTES - SMALL_GAP),
      },
    });

    // A four-byte character does not fit in the last two bytes, so it starts a segment.
    chats.apply(chat, { type: AHPActionType.ChatDelta, turnId: "t1", partId: "m1", content: "😀" });
    expect(segments().map((segment) => segment.bytes)).toEqual([
      SEGMENT_BYTES - SMALL_GAP,
      EMOJI_BYTES,
    ]);

    // The next text fills the last segment first. Earlier segments do not change.
    const [first] = segments();
    chats.apply(chat, {
      type: AHPActionType.ChatDelta,
      turnId: "t1",
      partId: "m1",
      content: "é".repeat(SEGMENT_BYTES),
    });
    const stored = segments();
    expect(stored[0]).toEqual(first);
    expect(stored.map((segment) => segment.bytes)).toEqual([
      SEGMENT_BYTES - SMALL_GAP,
      SEGMENT_BYTES,
      SEGMENT_BYTES,
      EMOJI_BYTES,
    ]);

    for (const segment of stored) {
      expect(encoder.encode(segment.text).length).toBe(segment.bytes);
      expect(segment.text.isWellFormed()).toBe(true);
    }

    const [part] = chats.snapshot(chat).activeTurn?.responseParts ?? [];
    expect(part).toEqual({
      kind: AHPResponsePartKind.Markdown,
      id: "m1",
      content: `${"a".repeat(SEGMENT_BYTES - SMALL_GAP)}😀${"é".repeat(SEGMENT_BYTES)}`,
    });
  });
});

it("removes the partial input segments when a tool call stops streaming", async () => {
  await withStore(({ db, chats, chat }) => {
    chats.apply(chat, turnStarted("t1"));
    chats.apply(chat, {
      type: AHPActionType.ChatToolCallStart,
      turnId: "t1",
      toolCallId: "tc1",
      toolName: "read",
      displayName: "Read",
    });
    chats.apply(chat, {
      type: AHPActionType.ChatToolCallDelta,
      turnId: "t1",
      toolCallId: "tc1",
      content: mixedText(LARGE_TEXT_BYTES),
    });
    expect(db.orm.select().from(textSegmentsTable).all().length).toBeGreaterThan(1);

    chats.apply(chat, {
      type: AHPActionType.ChatToolCallReady,
      turnId: "t1",
      toolCallId: "tc1",
      invocationMessage: "Read",
      toolInput: "{}",
      confirmed: AHPToolCallConfirmationReason.NotNeeded,
    });

    expect(db.orm.select().from(textSegmentsTable).all()).toEqual([]);
    expect(chats.snapshot(chat).activeTurn?.responseParts).toMatchObject([
      { toolCall: { status: "running", toolInput: "{}" } },
    ]);
  });
});

/** Returns the number of rows that `operation` reads through `storage`. */
function countRowsRead(storage: DurableObjectStorage, operation: () => void): number {
  const { sql } = storage;
  const exec = sql.exec.bind(sql);
  const cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];

  sql.exec = <Row extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: SqlStorageValue[]
  ): SqlStorageCursor<Row> => {
    const cursor = exec<Row>(query, ...bindings);
    cursors.push(cursor);

    return cursor;
  };

  try {
    operation();
  } finally {
    sql.exec = exec;
  }

  return cursors.reduce((total, cursor) => total + cursor.rowsRead, 0);
}

/**
 * Stores `history` ended turns, and an active turn with `history` pending tool calls and
 * `history` earlier markdown parts. Then stores a markdown part, a reasoning part, and a
 * streaming tool call, each with about `history` text segments. Returns the rows that one
 * delta to each of these three parts reads.
 */
async function appendCost(history: number): Promise<number[]> {
  const name = sessionDOName(crypto.randomUUID(), crypto.randomUUID());

  return await runInDurableObject(env.CONVERSATIONS.getByName(name), async (_instance, ctx) => {
    const db = new SessionDatabase(ctx.storage);
    await db.migrate();
    const records = new SessionRecords(db, () => false);
    const rows = newRecord();
    records.insertIfAbsent(() => rows);
    const chat = rows.chat.summary.resource;
    const store = { db, records, chats: records.chats, chat, subscribed: new Set<string>() };
    storeHistory(store, history);
    store.chats.apply(store.chat, turnStarted("active"));

    // Running tool calls with large inputs stay pending. A text delta does not read them.
    for (let index = 0; index < history; index += 1) {
      const toolCallId = `tool${index}`;
      const toolCall = { turnId: "active", toolCallId, toolName: "read", displayName: "Read" };
      store.chats.apply(store.chat, { type: AHPActionType.ChatToolCallStart, ...toolCall });

      store.chats.apply(store.chat, {
        type: AHPActionType.ChatToolCallReady,
        turnId: "active",
        toolCallId,
        invocationMessage: "Read",
        toolInput: mixedText(SEGMENT_BYTES),
        confirmed: AHPToolCallConfirmationReason.NotNeeded,
      });
    }

    for (let index = 0; index <= history; index += 1) {
      const content = index === history ? mixedText(history * SEGMENT_BYTES) : "earlier";

      store.chats.apply(store.chat, {
        type: AHPActionType.ChatResponsePart,
        turnId: "active",
        part: { kind: AHPResponsePartKind.Markdown, id: `m${index}`, content },
      });
    }

    const longText = mixedText(history * SEGMENT_BYTES);
    const stream = { turnId: "active", toolCallId: "streaming" };

    store.chats.apply(store.chat, {
      type: AHPActionType.ChatResponsePart,
      turnId: "active",
      part: { kind: AHPResponsePartKind.Reasoning, id: "r", content: longText },
    });

    store.chats.apply(store.chat, {
      type: AHPActionType.ChatToolCallStart,
      ...stream,
      toolName: "run",
      displayName: "Run",
    });

    store.chats.apply(store.chat, {
      type: AHPActionType.ChatToolCallDelta,
      ...stream,
      content: longText,
    });

    const deltas: AHPChatAction[] = [
      { type: AHPActionType.ChatDelta, turnId: "active", partId: `m${history}`, content: "more" },
      { type: AHPActionType.ChatReasoning, turnId: "active", partId: "r", content: "more" },
      { type: AHPActionType.ChatToolCallDelta, ...stream, content: "more" },
    ];

    const costs: number[] = [];

    for (const delta of deltas) {
      const append = appendWith(records, delta);
      costs.push(countRowsRead(ctx.storage, append));
    }

    return costs;
  });
}

it("reads the same rows for each append stream with a long history and with none", async () => {
  expect(await appendCost(HISTORY_TURNS)).toEqual(await appendCost(1));
});

/** Returns an operation that saves `delta` as one session change. */
function appendWith(records: SessionRecords, delta: AHPChatAction): () => void {
  return (): void => {
    records.save((record, chats) => applyChat(record, chats, delta));
  };
}

function failingChange(record: SessionRecord, store: ChatStore): never {
  applyChat(record, store, { type: AHPActionType.ChatTurnComplete, turnId: "t1", duration: 1 });
  throw new Error("Abort the change");
}

it("rolls back the chat rows and the revision when a change throws", async () => {
  await withStore(({ records, chats, chat }) => {
    chats.apply(chat, turnStarted("t1"));
    const before = { record: records.get(), chat: chats.snapshot(chat) };

    expect(() => records.save(failingChange)).toThrow("Abort the change");

    expect(records.get()).toEqual(before.record);
    expect(chats.snapshot(chat)).toEqual(before.chat);
  });
});

it("shares one window of loaded turns and pages older turns with cursors", async () => {
  await withStore((store) => {
    const { chats, chat } = store;
    const turnIds = storeHistory(store, HISTORY_TURNS);
    const full = chats.snapshot(chat);

    expect(chats.openWindow(chat, RECENT)).toBeUndefined();
    addSubscriber(store);
    const client = { state: chats.snapshot(chat) };
    expect(client.state.turns.map((turn) => turn.id)).toEqual(turnIds.slice(-RECENT));
    const firstCursor = client.state.turnsNextCursor;
    expect(firstCursor).toBeDefined();

    // Widening a subscription also loads the added turns for existing subscribers.
    const widened = chats.openWindow(chat, WIDER);
    expect(widened?.turns.map((turn) => turn.id)).toEqual(turnIds.slice(-WIDER, -RECENT));
    client.state = ahpChatReducer(
      client.state,
      widened ?? { type: AHPActionType.ChatTurnsLoaded, turns: [] },
    );
    expect(chats.openWindow(chat, NARROWER)).toBeUndefined();
    expect(chats.snapshot(chat)).toEqual(client.state);

    // The shared window now starts before this cursor. Fetching with the cursor loads nothing.
    expect(chats.fetchTurns(chat, firstCursor)).toBeUndefined();

    // A cursor with an earlier start than the window is unknown. The window never had it.
    const [windowId, currentStart] = (client.state.turnsNextCursor ?? "").split(".");
    const earlier = `${windowId}.${Number(currentStart) - 1}`;
    expect(() => chats.fetchTurns(chat, earlier)).toThrow("Unknown turns cursor");

    // A cursor in another spelling of the same start is unknown.
    const spelling = `${windowId}.0${currentStart}`;
    expect(() => chats.fetchTurns(chat, spelling)).toThrow("Unknown turns cursor");

    let cursor = client.state.turnsNextCursor;
    const pages: number[] = [];

    while (cursor !== undefined) {
      const loaded = chats.fetchTurns(chat, cursor);

      if (!loaded) {
        throw new Error("Expected a page");
      }

      pages.push(loaded.turns.length);
      client.state = ahpChatReducer(client.state, loaded);
      expect(chats.fetchTurns(chat, cursor)).toBeUndefined();
      ({ turnsNextCursor: cursor } = client.state);
    }

    const remaining = HISTORY_TURNS - WIDER - FETCH_TURNS_PAGE - FETCH_TURNS_PAGE;
    expect(pages).toEqual([FETCH_TURNS_PAGE, FETCH_TURNS_PAGE, remaining]);
    expect(client.state).toEqual(full);
    expect(chats.fetchTurns(chat)).toBeUndefined();
    expect(() => chats.fetchTurns(chat, "unknown")).toThrow("Unknown turns cursor");
  });
});

it("ends the window and its cursors when the chat has no subscribers", async () => {
  await withStore((store) => {
    const { chats, chat } = store;
    storeHistory(store, SHORT_HISTORY);
    chats.openWindow(chat, FIRST_WINDOW);
    addSubscriber(store);
    const cursor = chats.snapshot(chat).turnsNextCursor;

    store.subscribed.delete(chat);
    expect(() => chats.fetchTurns(chat, cursor)).toThrow("Unknown turns cursor");
    expect(chats.snapshot(chat).turns).toHaveLength(SHORT_HISTORY);

    chats.openWindow(chat, SECOND_WINDOW);
    addSubscriber(store);
    expect(chats.snapshot(chat).turns).toHaveLength(SECOND_WINDOW);
    expect(() => chats.fetchTurns(chat, cursor)).toThrow("Unknown turns cursor");
  });
});

it("truncates outside the window after it loads the kept turn, and renews the cursor", async () => {
  await withStore((store) => {
    const { db, chats, chat } = store;
    const turnIds = storeHistory(store, SHORT_HISTORY);
    chats.openWindow(chat, FIRST_WINDOW);
    addSubscriber(store);
    const client = { state: chats.snapshot(chat) };
    const oldCursor = client.state.turnsNextCursor;
    chats.apply(chat, turnStarted("active"));
    chats.apply(chat, {
      type: AHPActionType.ChatResponsePart,
      turnId: "active",
      part: { kind: AHPResponsePartKind.Markdown, id: "m", content: "text" },
    });
    client.state = chats.snapshot(chat);

    const kept = turnIds[KEPT] ?? "";
    const change = chats.apply(chat, { type: AHPActionType.ChatTruncated, turnId: kept });

    for (const action of change.actions) {
      client.state = ahpChatReducer(client.state, action);
    }

    expect(change.actions.map((action) => action.type)).toEqual([
      AHPActionType.ChatTurnsLoaded,
      AHPActionType.ChatTruncated,
      AHPActionType.ChatTurnsLoaded,
    ]);
    expect(client.state.turns.map((turn) => turn.id)).toEqual([kept]);
    expect(client.state.activeTurn).toBeUndefined();
    expect(chats.snapshot(chat)).toEqual(client.state);
    expect(client.state.turnsNextCursor).not.toBe(oldCursor);
    expect(() => chats.fetchTurns(chat, oldCursor)).toThrow("Unknown turns cursor");

    const loaded = chats.fetchTurns(chat, client.state.turnsNextCursor);
    expect(loaded?.turns.map((turn) => turn.id)).toEqual(turnIds.slice(0, KEPT));

    // A full truncation removes all turns, parts, and segments, and clears the cursor.
    chats.apply(chat, { type: AHPActionType.ChatTruncated });
    const cleared = chats.snapshot(chat);
    expect(cleared.turns).toEqual([]);
    expect(cleared.turnsNextCursor).toBeUndefined();
    expect(db.orm.select().from(textSegmentsTable).all()).toEqual([]);

    chats.apply(chat, turnStarted("after"));
    expect(chats.snapshot(chat).activeTurn?.id).toBe("after");
  });
});

it("replaces the chat summary when a summary field is cleared", async () => {
  await withStore(({ records, chat }) => {
    const activity = { type: AHPActionType.ChatActivityChanged, activity: "Thinking" } as const;
    const cleared = { type: AHPActionType.ChatActivityChanged } as const;
    const set = records.save((record, chats) => applyChat(record, chats, activity));
    const clear = records.save((record, chats) => applyChat(record, chats, cleared));

    const sessionActions = [set, clear].map((saved) =>
      saved.status === "applied" ? saved.update.actions.at(LAST)?.action : undefined,
    );

    expect(sessionActions).toMatchObject([
      { type: AHPActionType.SessionChatUpdated, changes: { activity: "Thinking" } },
      { type: AHPActionType.SessionChatAdded, summary: { resource: chat } },
    ]);
    expect(sessionActions[1]).not.toHaveProperty("summary.activity");
  });
});
