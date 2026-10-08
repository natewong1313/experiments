import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import {
  ChatStateSchema,
  ContentRefSchema,
  type ChatAction,
} from "@experiments/protocol-schemas/ahp";
import { createHostState, type HostState, createSession } from "./config";
import { reduceChat } from "../src/state/reducers";
import { connectPeer, Peer } from "./peer";

const SESSION = "ahp-session:/normalized";
const STARTED = "2026-10-01T00:00:00.000Z";
const LARGE_BYTES = 100_000;
const TOOL_COUNT = 300;
const JOURNAL_COUNT = 1005;
const OVERSIZED_BYTES = 2_000_000;
const UNICODE_BOUNDARY = 16_383;
const ESCAPED_CHARACTERS = 200_000;
const ENCODING_BYTES = 800_000;

type StoreCheck = (store: HostState, state: DurableObjectState, chat: string) => void;

async function withStore(check: StoreCheck): Promise<void> {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, (_instance, state) => {
    const store = createHostState(state.storage);
    createSession(store, SESSION, "generation");
    store.mutations.applyAction(SESSION, { type: "session/ready" });
    check(store, state, store.queries.requireMetadata(SESSION).chatUri);
  });
}

function start(id = "turn"): ChatAction {
  return {
    type: "chat/turnStarted",
    turnId: id,
    startedAt: STARTED,
    message: { text: "hello", origin: { kind: "user" } },
  };
}

function toolActions(id: string): ChatAction[] {
  return [
    {
      type: "chat/toolCallStart",
      turnId: "turn",
      toolCallId: id,
      toolName: "read",
      displayName: id,
    },
    { type: "chat/toolCallReady", turnId: "turn", toolCallId: id, invocationMessage: id },
  ];
}

function equivalent(store: HostState, chat: string, actions: ChatAction[]): number {
  let mirror = ChatStateSchema.parse(store.queries.readSnapshot(chat).state);

  for (const action of actions) {
    const publication = store.mutations.applyAction(chat, action);
    const [envelope] = publication.actions;
    mirror = reduceChat(mirror, envelope.action);
    expect(store.queries.readSnapshot(chat).state).toEqual(mirror);
  }

  return actions.length;
}

it("matches every intermediate reducer state for interleaved parts, tools, no-ops, inputs and cancellation", async () => {
  await withStore((store, _state, chat) => {
    const compared = equivalent(store, chat, [
      start(),
      {
        type: "chat/responsePart",
        turnId: "turn",
        part: { kind: "markdown", id: "text", content: "" },
      },
      {
        type: "chat/delta",
        turnId: "turn",
        partId: "text",
        content: `${"a".repeat(UNICODE_BOUNDARY)}😀\n漢字`,
      },
      { type: "chat/delta", turnId: "turn", partId: "text", content: "\uD83D" },
      { type: "chat/delta", turnId: "turn", partId: "text", content: "\uDE00" },
      ...toolActions("first"),
      ...toolActions("second"),
      {
        type: "chat/toolCallConfirmed",
        turnId: "turn",
        toolCallId: "first",
        approved: true,
        confirmed: "user-action",
      },
      {
        type: "chat/toolCallComplete",
        turnId: "turn",
        toolCallId: "first",
        result: {
          success: true,
          pastTenseMessage: "done",
          content: [{ type: "text", text: "old" }],
        },
        requiresResultConfirmation: true,
      },
      {
        type: "chat/toolCallContentChanged",
        turnId: "turn",
        toolCallId: "first",
        content: [{ type: "text", text: "ignored" }],
      },
      { type: "chat/toolCallResultConfirmed", turnId: "turn", toolCallId: "first", approved: true },
      {
        type: "chat/toolCallReady",
        turnId: "wrong",
        toolCallId: "missing",
        invocationMessage: "ignored",
      },
      {
        type: "chat/responsePart",
        turnId: "turn",
        part: { kind: "reasoning", id: "reason", content: "初" },
      },
      { type: "chat/reasoning", turnId: "turn", partId: "reason", content: "後" },
      { type: "chat/delta", turnId: "turn", partId: "reason", content: "ignored" },
      { type: "chat/inputRequested", request: { id: "question", message: "choose" } },
      {
        type: "chat/inputAnswerChanged",
        requestId: "question",
        questionId: "value",
        answer: { state: "draft", value: { kind: "text", value: "yes" } },
      },
      { type: "chat/inputRequested", request: { id: "question", message: "choose again" } },
      { type: "chat/inputCompleted", requestId: "question", response: "accept" },
      { type: "chat/usage", turnId: "turn", usage: { _meta: { tokens: 10 } } },
      { type: "chat/turnCancelled", turnId: "turn", duration: -1 },
      { type: "chat/delta", turnId: "turn", partId: "text", content: "late" },
    ]);

    expect(compared).toBeGreaterThan(0);
  });
});

it("matches content replacement, error, resume, truncation and duplicate part identities", async () => {
  await withStore((store, _state, chat) => {
    const compared = equivalent(store, chat, [
      start(),
      ...toolActions("same"),
      ...toolActions("same"),
      {
        type: "chat/toolCallReady",
        turnId: "turn",
        toolCallId: "same",
        invocationMessage: "run",
        confirmed: "not-needed",
      },
      {
        type: "chat/toolCallContentChanged",
        turnId: "turn",
        toolCallId: "same",
        content: [{ type: "text", text: "one" }],
      },
      {
        type: "chat/toolCallContentChanged",
        turnId: "turn",
        toolCallId: "same",
        content: [{ type: "text", text: "two" }],
      },
      {
        type: "chat/responsePart",
        turnId: "turn",
        part: { kind: "markdown", id: "same", content: "" },
      },
      {
        type: "chat/delta",
        turnId: "turn",
        partId: "same",
        content: "ignored because tool matches first",
      },
      {
        type: "chat/error",
        turnId: "turn",
        duration: 1,
        part: { kind: "error", error: { errorType: "agent", message: "retry" }, resumable: true },
      },
      { type: "chat/turnResume", turnId: "turn" },
      { type: "chat/turnComplete", turnId: "turn", duration: 1 },
      start("second"),
      { type: "chat/turnComplete", turnId: "second", duration: 1 },
      { type: "chat/truncated", turnId: "missing" },
      { type: "chat/truncated", turnId: "turn" },
      { type: "chat/truncated" },
    ]);

    expect(compared).toBeGreaterThan(0);
  });
});

it("never reads stored text during append and never touches earlier tools or result bodies during status updates", async () => {
  await withStore((store, state, chat) => {
    store.mutations.applyAction(chat, start());
    store.mutations.applyAction(chat, {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "text", content: "x".repeat(LARGE_BYTES) },
    });

    for (let index = 0; index < TOOL_COUNT; index++) {
      store.mutations.applyChatActions(store.queries.requireMetadata(chat), [
        ...toolActions(`tool-${index}`),
        {
          type: "chat/toolCallComplete",
          turnId: "turn",
          toolCallId: `tool-${index}`,
          result: {
            success: true,
            pastTenseMessage: "done",
            content: [{ type: "text", text: "x".repeat(LARGE_BYTES) }],
          },
        },
      ]);
    }

    store.mutations.applyChatActions(store.queries.requireMetadata(chat), toolActions("target"));
    const { sql } = state.storage;
    sql.exec(
      "CREATE TRIGGER forbid_result_rewrite BEFORE UPDATE ON reply_parts WHEN OLD.identity != 'target' AND OLD.kind = 'toolCall' BEGIN SELECT RAISE(ABORT, 'unrelated tool rewritten'); END",
    );
    sql.exec(
      "CREATE TRIGGER forbid_content_rewrite BEFORE UPDATE ON content_pieces BEGIN SELECT RAISE(ABORT, 'result rewritten'); END",
    );
    const queries = vi.spyOn(sql, "exec");

    try {
      store.mutations.applyAction(chat, {
        type: "chat/delta",
        turnId: "turn",
        partId: "text",
        content: "😀",
      });
      store.mutations.applyAction(chat, {
        type: "chat/toolCallConfirmed",
        turnId: "turn",
        toolCallId: "target",
        approved: true,
        confirmed: "user-action",
      });
      const reads = queries.mock.calls.filter(([query]) => query.startsWith("SELECT"));
      expect(
        reads.some(
          ([query]) => query.includes("FROM text_pieces") || query.includes("FROM content_pieces"),
        ),
      ).toBe(false);
      expect(
        reads
          .filter(([query]) => query.includes("FROM reply_parts"))
          .every(([query]) => query.includes("identity = ?")),
      ).toBe(true);
    } finally {
      queries.mockRestore();
    }
  });
});

function replaceContent(text: string): ChatAction {
  return {
    type: "chat/toolCallContentChanged",
    turnId: "turn",
    toolCallId: "tool",
    content: [{ type: "text", text }],
  };
}

function replaceLetter(store: HostState, chat: string, letter: string): void {
  const text = letter.repeat(LARGE_BYTES);
  store.mutations.applyAction(chat, replaceContent(text));
}

function resultReference(store: HostState, chat: string): string {
  const state = ChatStateSchema.parse(store.queries.readSnapshot(chat).state);
  const part = state.activeTurn?.responseParts[0];

  if (part?.kind !== "toolCall" || !("content" in part.toolCall)) {
    throw new Error("Missing tool content");
  }

  const content = part.toolCall.content?.[0];

  if (content?.type !== "resource") {
    throw new Error("Missing resource");
  }

  return content.uri;
}

it("keeps replacement versions readable for replay, cleans disposed content after replay expires and rolls content back with state", async () => {
  await withStore((store, state, chat) => {
    store.mutations.applyAction(chat, start());
    store.mutations.applyChatActions(store.queries.requireMetadata(chat), toolActions("tool"));
    store.mutations.applyAction(chat, {
      type: "chat/toolCallConfirmed",
      turnId: "turn",
      toolCallId: "tool",
      approved: true,
      confirmed: "user-action",
    });
    replaceLetter(store, chat, "a");
    const first = resultReference(store, chat);
    replaceLetter(store, chat, "b");
    const second = resultReference(store, chat);
    expect(first).not.toBe(second);
    expect(store.queries.readResource(first).data).toBe("a".repeat(LARGE_BYTES));
    const before = store.queries.readSnapshot(chat);

    const { count } = state.storage.sql
      .exec<{ count: number }>("SELECT COUNT(*) AS count FROM contents")
      .one();

    state.storage.sql.exec(
      "CREATE TRIGGER fail_content BEFORE INSERT ON content_pieces WHEN NEW.piece = 1 BEGIN SELECT RAISE(ABORT, 'content failure'); END",
    );
    expect(() => {
      replaceLetter(store, chat, "c");
    }).toThrow("content failure");
    expect(store.queries.readSnapshot(chat)).toEqual(before);
    expect(
      state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM contents").one()
        .count,
    ).toBe(count);
    state.storage.sql.exec("DROP TRIGGER fail_content");
    store.mutations.deleteSession(SESSION);
    expect(store.queries.readResource(first).data).toBe("a".repeat(LARGE_BYTES));
    createSession(store, SESSION, "new-generation");

    for (let index = 0; index < JOURNAL_COUNT; index++) {
      store.mutations.applyAction(SESSION, {
        type: "session/titleChanged",
        title: `title-${index}`,
      });
    }

    expect(() => store.queries.readResource(first)).toThrow("expired");
    expect(
      state.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM content_pieces")
        .one().count,
    ).toBe(0);
  });
});

it("deduplicates large ACP metadata within a transaction and bounds incoming content", async () => {
  await withStore((store, state, chat) => {
    store.mutations.applyAction(chat, start());
    store.mutations.applyChatActions(store.queries.requireMetadata(chat), toolActions("tool"));
    const metadata = { acp: { rawOutput: "x".repeat(LARGE_BYTES) } };

    const publication = store.mutations.applyAction(chat, {
      type: "chat/toolCallComplete",
      turnId: "turn",
      toolCallId: "tool",
      result: { success: true, pastTenseMessage: "done", structuredContent: metadata },
      _meta: metadata,
    });

    expect(
      state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM contents").one()
        .count,
    ).toBe(1);
    const [envelope] = publication.actions;
    const { action } = envelope;

    if (action.type !== "chat/toolCallComplete") {
      throw new Error("Wrong action");
    }

    const ref = ContentRefSchema.parse(action._meta?.contentRef);
    const savedMetadata: unknown = JSON.parse(store.queries.readResource(ref.uri).data);
    expect(savedMetadata).toEqual(metadata);
    const before = store.queries.readSnapshot(chat);
    expect(() =>
      store.mutations.applyAction(chat, {
        type: "chat/responsePart",
        turnId: "turn",
        part: { kind: "contentRef", uri: `data:text/plain,${"x".repeat(OVERSIZED_BYTES)}` },
      }),
    ).toThrow("resource response budget");
    expect(store.queries.readSnapshot(chat)).toEqual(before);
    expect(() =>
      store.mutations.applyAction(chat, {
        type: "chat/responsePart",
        turnId: "turn",
        part: { kind: "contentRef", uri: `data:text/plain,${"%00".repeat(ESCAPED_CHARACTERS)}` },
      }),
    ).toThrow("resource response budget");
    expect(store.queries.readSnapshot(chat)).toEqual(before);

    const conversion = store.mutations.applyAction(chat, {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "contentRef", uri: `data:text/plain,${"x".repeat(ENCODING_BYTES)}` },
    });

    const [converted] = conversion.actions;

    if (
      converted.action.type !== "chat/responsePart" ||
      converted.action.part.kind !== "contentRef"
    ) {
      throw new Error("Missing resource reference");
    }

    const { uri } = converted.action.part;
    expect(store.queries.readResource(uri).data.length).toBe(ENCODING_BYTES);
    expect(() => store.queries.readResource(uri, "base64")).toThrow("encoding budget");
  });
});

it("recovers a saved normalized turn across real eviction without resending", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  await runInDurableObject(stub, (_instance, state) => {
    const store = createHostState(state.storage);
    createSession(store, SESSION, "saved-key");
    store.mutations.bindAgentSession(SESSION, "saved-agent");
    store.mutations.applyAction(SESSION, { type: "session/ready" });
    const chat = store.queries.requireMetadata(SESSION).chatUri;
    store.mutations.applyAction(chat, start());
    store.mutations.applyAction(chat, {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "text", content: "accepted 😀" },
    });
    expect(store.queries.requireWithActiveOutput(chat).chat.activeTurn?.responseParts).toEqual([
      { kind: "markdown", id: "text", content: "accepted 😀" },
    ]);
  });
  await evictDurableObject(stub);
  await runInDurableObject(stub, (_instance, state) => {
    const store = createHostState(state.storage);
    const record = store.queries.requireMetadata(SESSION);
    const chat = ChatStateSchema.parse(store.queries.readSnapshot(record.chatUri).state);
    expect(chat.activeTurn).toBeUndefined();
    expect(chat.turns[0]?.responseParts).toMatchObject([
      { kind: "markdown", content: "accepted 😀" },
      { kind: "error", error: { errorType: "interrupted" } },
    ]);
    expect(record.sessionKey).toBe("saved-key");
    expect(record.acpSession).toBe("saved-agent");
  });
});

it("reads metadata, live state and snapshots without opening transactions or writing records", async () => {
  await withStore((store, state, chat) => {
    store.mutations.applyAction(chat, start());
    store.mutations.applyAction(chat, {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "text", content: "accepted" },
    });
    const transaction = vi.spyOn(state.storage, "transactionSync");
    const queries = vi.spyOn(state.storage.sql, "exec");

    try {
      expect(store.queries.lookupMetadata(chat)?.chat.activeTurn?.responseParts).toEqual([]);
      expect(store.queries.lookupWithActiveOutput(chat)?.chat.activeTurn?.responseParts).toEqual([
        { kind: "markdown", id: "text", content: "accepted" },
      ]);
      const snapshot = store.queries.readSnapshot(chat);
      const saved = ChatStateSchema.parse(snapshot.state);
      expect(saved.activeTurn?.responseParts).toEqual([
        { kind: "markdown", id: "text", content: "accepted" },
      ]);
      expect(transaction).not.toHaveBeenCalled();
      expect(queries.mock.calls.every(([query]) => query.toUpperCase().startsWith("SELECT"))).toBe(
        true,
      );
    } finally {
      transaction.mockRestore();
      queries.mockRestore();
    }
  });
});

it("serves resources only after initialization and only from the owning host", async () => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());

  const uri = await runInDurableObject(stub, (_instance, state) => {
    const store = createHostState(state.storage);
    createSession(store, SESSION, "generation");
    const chat = store.queries.requireMetadata(SESSION).chatUri;
    store.mutations.applyAction(chat, start());
    store.mutations.applyAction(chat, {
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "contentRef", uri: "data:text/plain;charset=utf-8,%F0%9F%98%80" },
    });

    const saved = ChatStateSchema.parse(store.queries.readSnapshot(chat).state).activeTurn
      ?.responseParts[0];

    const resource = ContentRefSchema.strip().parse(saved).uri;

    return resource;
  });

  const response = await stub.fetch("https://host/ahp", { headers: { Upgrade: "websocket" } });

  if (!response.webSocket) {
    throw new Error("Missing client socket");
  }

  const uninitialized = new Peer(response.webSocket);

  try {
    await expect(
      uninitialized.request("resourceRead", { channel: "ahp-root://", uri }),
    ).rejects.toThrow("Initialize the connection first");
  } finally {
    uninitialized.close();
  }

  const peer = await connectPeer(stub);
  const otherStub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());
  const other = await connectPeer(otherStub);

  try {
    expect(await peer.request("resourceRead", { channel: "ahp-root://", uri })).toMatchObject({
      data: "😀",
      encoding: "utf-8",
    });
    expect(
      await peer.request("resourceRead", { channel: "ahp-root://", uri, encoding: "base64" }),
    ).toMatchObject({ data: "8J+YgA==", encoding: "base64" });
    await expect(other.request("resourceRead", { channel: "ahp-root://", uri })).rejects.toThrow(
      "does not belong",
    );
    const wrongChannel = { channel: SESSION, uri };
    await expect(peer.request("resourceRead", wrongChannel)).rejects.toThrow("Invalid");
  } finally {
    peer.close();
    other.close();
  }
});
