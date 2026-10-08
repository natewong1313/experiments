import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { expect, it, vi } from "vitest";
import type { ChatAction } from "@experiments/protocol-schemas/ahp";
import { createHostState, type HostState, createSession } from "./config";
import { DocumentBaseline } from "./document-baseline";
import { ActionJournal } from "../src/state/replay/journal";
import { reduceChat } from "../src/state/reducers";

const STARTED = "2026-10-01T00:00:00.000Z";
const RESULT_BYTES = 512;
const SMALL_TEXT = 10_000;
const MEDIUM_TEXT = 100_000;
const LARGE_TEXT = 1_000_000;
const SMALL_TOOLS = 10;
const MEDIUM_TOOLS = 100;
const LARGE_TOOLS = 1000;
const MAX_FOCUSED_ROWS = 100;

const CASES = [
  { name: "text-10k", text: SMALL_TEXT, tools: 0 },
  { name: "text-100k", text: MEDIUM_TEXT, tools: 0 },
  { name: "text-1m", text: LARGE_TEXT, tools: 0 },
  { name: "tools-10", text: 0, tools: SMALL_TOOLS },
  { name: "tools-100", text: 0, tools: MEDIUM_TOOLS },
  { name: "tools-1000", text: 0, tools: LARGE_TOOLS },
  { name: "mixed", text: MEDIUM_TEXT, tools: LARGE_TOOLS },
];

type Work = {
  jsonBytesParsed: number;
  rowsRead: number;
  rowsWritten: number;
  payloadBytesWritten: number;
};

type Fixture = (typeof CASES)[number];

function measure(sql: SqlStorage, update: () => void): Work {
  sql.exec("DELETE FROM write_audit");
  const spy = vi.spyOn(sql, "exec");
  const parse = vi.spyOn(JSON, "parse");

  try {
    update();

    const cursors = spy.mock.results.flatMap((result) =>
      result.type === "return" ? [result.value] : [],
    );

    const rowsRead = cursors.reduce((total, cursor) => total + cursor.rowsRead, 0);
    const rowsWritten = cursors.reduce((total, cursor) => total + cursor.rowsWritten, 0);

    const { bytes } = sql
      .exec<{ bytes: number }>("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM write_audit")
      .one();

    let jsonBytesParsed = 0;

    for (const [text] of parse.mock.calls) {
      jsonBytesParsed += new TextEncoder().encode(text).byteLength;
    }

    return { jsonBytesParsed, rowsRead, rowsWritten, payloadBytesWritten: bytes };
  } finally {
    spy.mockRestore();
    parse.mockRestore();
  }
}

function audit(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE write_audit (bytes INTEGER);
    CREATE TRIGGER audit_document_insert AFTER INSERT ON baseline_chunks BEGIN INSERT INTO write_audit VALUES (LENGTH(NEW.data)); END;
    CREATE TRIGGER audit_document_update AFTER UPDATE ON baseline_chunks BEGIN INSERT INTO write_audit VALUES (LENGTH(NEW.data)); END;
    CREATE TRIGGER audit_text AFTER INSERT ON text_pieces BEGIN INSERT INTO write_audit VALUES (LENGTH(CAST(NEW.text AS BLOB))); END;
    CREATE TRIGGER audit_part AFTER UPDATE ON reply_parts BEGIN INSERT INTO write_audit VALUES (LENGTH(CAST(NEW.metadata AS BLOB))); END;
    CREATE TRIGGER audit_turn AFTER UPDATE ON turn_records BEGIN INSERT INTO write_audit VALUES (LENGTH(CAST(NEW.metadata AS BLOB))); END;
    CREATE TRIGGER audit_action AFTER INSERT ON actions BEGIN INSERT INTO write_audit VALUES (LENGTH(CAST(NEW.envelope AS BLOB))); END;`);
}

function seed(store: HostState, fixture: Fixture, chat: string): ChatAction[] {
  const actions: ChatAction[] = [
    {
      type: "chat/turnStarted",
      turnId: "turn",
      startedAt: STARTED,
      message: { text: "hello", origin: { kind: "user" } },
    },
  ];

  if (fixture.text > 0) {
    actions.push({
      type: "chat/responsePart",
      turnId: "turn",
      part: { kind: "markdown", id: "text", content: "x".repeat(fixture.text) },
    });
  }

  for (let index = 0; index < fixture.tools; index++) {
    actions.push({
      type: "chat/responsePart",
      turnId: "turn",
      part: {
        kind: "toolCall",
        toolCall: {
          status: "completed",
          toolCallId: `tool-${index}`,
          toolName: "read",
          displayName: "Read",
          invocationMessage: "read",
          confirmed: "not-needed",
          success: true,
          pastTenseMessage: "read",
          content: [{ type: "text", text: "x".repeat(RESULT_BYTES) }],
        },
      },
    });
  }

  if (fixture.tools > 0) {
    actions.push(
      {
        type: "chat/toolCallStart",
        turnId: "turn",
        toolCallId: "target",
        toolName: "read",
        displayName: "Read",
      },
      {
        type: "chat/toolCallReady",
        turnId: "turn",
        toolCallId: "target",
        invocationMessage: "read",
      },
    );
  }

  store.mutations.applyChatActions(store.queries.requireMetadata(chat), actions);

  return actions;
}

type BaselineUpdateParams = {
  state: DurableObjectState;
  documents: DocumentBaseline;
  journal: ActionJournal;
  chat: string;
  action: ChatAction;
};

function baselineUpdate({ state, documents, journal, chat, action }: BaselineUpdateParams): void {
  state.storage.transactionSync(() => {
    const previous = documents.read("baseline", "live");
    documents.write("baseline", "live", reduceChat(previous, action));
    journal.append(chat, action);
  });
}

it.each(CASES)("measures storage work for $name", async (fixture) => {
  const stub = env.AGENT_HOST.get(env.AGENT_HOST.newUniqueId());

  const result = await runInDurableObject(stub, (_instance, state) => {
    const store = createHostState(state.storage);
    createSession(store, "ahp-session:/work", "generation");
    const chat = store.queries.requireMetadata("ahp-session:/work").chatUri;
    const empty = store.queries.requireMetadata(chat).chat;
    const actions = seed(store, fixture, chat);

    let baselineState = empty;

    for (const action of actions) {
      baselineState = reduceChat(baselineState, action);
    }

    const documents = new DocumentBaseline(state.storage.sql);
    documents.write("baseline", "live", baselineState);
    const journal = new ActionJournal(drizzle(state.storage, { casing: "snake_case" }));
    audit(state.storage.sql);
    const delta: ChatAction = { type: "chat/delta", turnId: "turn", partId: "text", content: "x" };

    const tool: ChatAction = {
      type: "chat/toolCallConfirmed",
      turnId: "turn",
      toolCallId: "target",
      approved: true,
      confirmed: "user-action",
    };

    const updates = fixture.text > 0 ? (fixture.tools > 0 ? [delta, tool] : [delta]) : [tool];

    const baseline = measure(state.storage.sql, () => {
      for (const action of updates) {
        baselineUpdate({ state, documents, journal, chat, action });
      }
    });

    const normalized = measure(state.storage.sql, () => {
      for (const action of updates) {
        store.mutations.applyAction(chat, action);
      }
    });

    const cut = store.queries.sequence;

    const snapshot = measure(state.storage.sql, () => {
      store.queries.readSnapshot(chat, 0);
    });

    const complete = measure(state.storage.sql, () => {
      store.mutations.applyAction(chat, { type: "chat/turnComplete", turnId: "turn", duration: 1 });
    });

    expect(store.queries.sequence).toBeGreaterThan(cut);

    return { name: fixture.name, baseline, normalized, snapshot, complete };
  });

  expect(result.normalized.rowsRead).toBeLessThan(MAX_FOCUSED_ROWS);
  expect(result.normalized.payloadBytesWritten).toBeLessThan(result.baseline.payloadBytesWritten);
  expect(result).toMatchSnapshot();
});
