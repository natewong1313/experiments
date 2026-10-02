import { asc, count, eq, gt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { deepEqual } from "fast-equals";
import type {
  ActionEnvelope,
  ActionOrigin,
  AgentInfo,
  SessionSummary,
  Snapshot,
  StateAction,
} from "@experiments/protocol-schemas/ahp";
import { reduceChat, reduceRoot, reduceSession } from "./reducers";
import { ROOT, RpcCodes, ProtocolError } from "../ahp/protocol";
import { JsonDocuments } from "../storage/json-documents";
import { ActionJournal } from "../storage/journal";
import { ChatStore } from "../storage/chat-store";
import storeMigrations from "../../drizzle/migrations";
import { IDLE, type LiveSession } from "../sessions/record";
import { projectChat, sessionSummary } from "./projections";
import { host, sessions } from "../storage/schema";
import type { InferSelectModel } from "drizzle-orm";

const SEQUENCE_INCREMENT = 1;
const HOST_ID = 1;
type Database = ReturnType<typeof drizzle>;
type HostRow = InferSelectModel<typeof host>;
type SessionRow = InferSelectModel<typeof sessions>;
type Publication = {
  actions: [ActionEnvelope, ...ActionEnvelope[]];
  summary?: SessionSummary;
};

class HostStore {
  private readonly storage: DurableObjectStorage;
  private readonly db: Database;
  private readonly journal: ActionJournal;
  private readonly chats: ChatStore;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
    this.db = drizzle(state.storage);
    const documents = new JsonDocuments(state.storage.sql);
    this.chats = new ChatStore(this.db, documents);
    this.journal = new ActionJournal(this.db);
    // The durable-sqlite migrator executes synchronously on the sync driver.
    // Tables exist before this constructor returns and before recover() runs.
    // The outcome goes through state.blockConcurrencyWhile so that a failed
    // Migration fails DO initialization instead of surfacing later.
    const applied = migrate(this.db, storeMigrations);
    void state.blockConcurrencyWhile(() => applied);
  }

  get sequence(): number {
    return this.journal.sequence;
  }

  sessions(): SessionSummary[] {
    return this.db
      .select()
      .from(sessions)
      .orderBy(asc(sessions.uri))
      .all()
      .map((row) => sessionSummary(row));
  }

  list(input: { cursor?: string; limit: number }): {
    items: SessionSummary[];
    nextCursor?: string;
  } {
    if (input.cursor !== void 0) {
      const cursor = this.db
        .select({ uri: sessions.uri })
        .from(sessions)
        .where(eq(sessions.uri, input.cursor))
        .get();
      if (!cursor) {
        throw new ProtocolError(RpcCodes.params, "Invalid session cursor");
      }
    }
    const rows = this.db
      .select()
      .from(sessions)
      .where(input.cursor === void 0 ? void 0 : gt(sessions.uri, input.cursor))
      .orderBy(asc(sessions.uri))
      .limit(input.limit + SEQUENCE_INCREMENT)
      .all();
    const page = rows.slice(0, input.limit);
    const last = page.at(-SEQUENCE_INCREMENT);
    return {
      items: page.map((row) => sessionSummary(row)),
      ...(last !== void 0 && rows.length > input.limit
        ? { nextCursor: last.uri }
        : {}),
    };
  }

  lookup(channel: string): LiveSession | null {
    const row = this.entry(channel);
    if (!row) {
      return null;
    }
    return { ...row, chat: this.chats.live(row.chatUri) };
  }

  require(channel: string): LiveSession {
    const record = this.lookup(channel);
    if (!record) {
      throw new ProtocolError(
        RpcCodes.sessionMissing,
        "Session does not exist",
      );
    }
    return record;
  }

  hasTurn(chatUri: string, turnId: string): boolean {
    return this.chats.hasTurn(chatUri, turnId);
  }

  snapshot(channel: string): Snapshot {
    let state: Snapshot["state"];
    if (channel === ROOT) {
      state = this.hostRow().root;
    } else {
      const row = this.entry(channel);
      if (!row) {
        throw new ProtocolError(
          RpcCodes.sessionMissing,
          "Session does not exist",
        );
      }
      state = row.uri === channel ? row.session : this.chats.snapshot(channel);
    }
    return { resource: channel, state, fromSeq: this.sequence };
  }

  configureAgent(agent: AgentInfo): Publication | null {
    const agents = [agent];

    if (deepEqual(this.hostRow().root.agents, agents)) {
      return null;
    }
    return this.apply(ROOT, { type: "root/agentsChanged", agents });
  }

  create({
    uri,
    sessionKey,
    provider,
    workingDirectory,
  }: {
    uri: string;
    sessionKey: string;
    provider: string;
    workingDirectory: string;
  }): Publication {
    return this.storage.transactionSync(() => {
      if (this.entry(uri)) {
        throw new ProtocolError(
          RpcCodes.sessionExists,
          "Session already exists",
        );
      }
      const now = new Date().toISOString();
      const chatUri = `ahp-chat:/${crypto.randomUUID()}`;
      const summary = {
        resource: chatUri,
        title: "Chat",
        status: IDLE,
        modifiedAt: now,
      };
      const session = {
        provider,
        title: "New session",
        status: IDLE,
        workingDirectories: [workingDirectory],
        lifecycle: "creating" as const,
        activeClients: [],
        chats: [summary],
        defaultChat: chatUri,
      };
      const record: LiveSession = {
        uri,
        chatUri,
        sessionKey,
        acpSession: null,
        createdAt: now,
        modifiedAt: now,
        session,
        chat: { ...summary, turns: [] },
      };
      this.db
        .insert(sessions)
        .values({
          uri,
          chatUri,
          sessionKey,
          acpSession: null,
          createdAt: now,
          modifiedAt: now,
          session,
        })
        .run();
      this.chats.save(chatUri, record.chat);
      return {
        actions: [this.activeSessionsChanged()],
        summary: sessionSummary(record),
      };
    });
  }

  bindAgent(uri: string, acpSession: string): void {
    this.storage.transactionSync(() => {
      const row = this.db
        .select({ uri: sessions.uri })
        .from(sessions)
        .where(eq(sessions.uri, uri))
        .get();
      if (!row) {
        throw new ProtocolError(
          RpcCodes.sessionMissing,
          "Session does not exist",
        );
      }
      this.db
        .update(sessions)
        .set({ acpSession })
        .where(eq(sessions.uri, uri))
        .run();
    });
  }

  remove(uri: string): Publication {
    return this.storage.transactionSync(() => {
      const row = this.db
        .select()
        .from(sessions)
        .where(eq(sessions.uri, uri))
        .get();
      if (!row) {
        throw new ProtocolError(
          RpcCodes.sessionMissing,
          "Session does not exist",
        );
      }
      this.db.delete(sessions).where(eq(sessions.uri, uri)).run();
      this.chats.remove(row.chatUri);
      return { actions: [this.activeSessionsChanged()] };
    });
  }

  apply(channel: string, action: StateAction): Publication {
    return this.storage.transactionSync(() => {
      if (channel === ROOT) {
        const next = reduceRoot(this.hostRow().root, action);
        this.db.update(host).set({ root: next }).where(eq(host.id, 1)).run();
        return { actions: [this.journal.append(channel, action)] };
      }
      return this.transition(this.require(channel), channel, action);
    });
  }

  replay(since: number, channels: string[]): ActionEnvelope[] | null {
    return this.journal.replay(since, channels);
  }

  previous(
    origin: ActionOrigin,
  ): { frame: string; envelope: ActionEnvelope } | null {
    return this.journal.previous(origin);
  }

  dispatch(input: {
    record: LiveSession;
    channel: string;
    action: StateAction;
    origin: ActionOrigin;
    frame: string;
    rejection?: string;
  }): Publication {
    return this.storage.transactionSync(() => {
      const { record, channel, action, origin, frame, rejection } = input;
      const publication: Publication =
        rejection === void 0
          ? this.transition(record, channel, action, origin)
          : {
              actions: [
                {
                  channel,
                  action,
                  origin,
                  serverSeq: this.sequence,
                  rejectionReason: rejection,
                },
              ],
            };
      const [envelope] = publication.actions;
      this.journal.remember({ origin, frame, envelope });
      return publication;
    });
  }

  private transition(
    record: LiveSession,
    channel: string,
    action: StateAction,
    origin?: ActionOrigin,
  ): Publication {
    const published: [ActionEnvelope, ...ActionEnvelope[]] = [
      this.journal.append(channel, action, origin),
    ];
    let next: LiveSession;
    if (channel === record.uri) {
      next = { ...record, session: reduceSession(record.session, action) };
    } else {
      const chat = reduceChat(record.chat, action);
      this.chats.save(record.chatUri, chat);
      next = { ...record, chat: { ...chat, turns: [] } };
      const projected = projectChat(record, chat);
      if (projected) {
        next = { ...next, session: reduceSession(record.session, projected) };
        published.push(this.journal.append(record.uri, projected));
      }
    }

    const changed = !deepEqual(next.session, record.session);

    if (changed) {
      this.db
        .update(sessions)
        .set({ session: next.session, modifiedAt: new Date().toISOString() })
        .where(eq(sessions.uri, record.uri))
        .run();
    }
    return {
      actions: published,
      ...(changed ? { summary: sessionSummary(next) } : {}),
    };
  }

  private activeSessionsChanged(): ActionEnvelope {
    const row = this.db.select({ value: count() }).from(sessions).get();
    const action: StateAction = {
      type: "root/activeSessionsChanged",
      activeSessions: row?.value ?? 0,
    };
    const next = reduceRoot(this.hostRow().root, action);
    this.db.update(host).set({ root: next }).where(eq(host.id, 1)).run();
    return this.journal.append(ROOT, action);
  }

  private entry(channel: string): SessionRow | undefined {
    const match = or(eq(sessions.uri, channel), eq(sessions.chatUri, channel));
    return this.db.select().from(sessions).where(match).get();
  }

  private hostRow(): HostRow {
    const row = this.db.select().from(host).where(eq(host.id, HOST_ID)).get();
    if (!row) {
      throw new Error("Host storage is not initialized");
    }
    return row;
  }
}

export { HostStore, type Publication };
