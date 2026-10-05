import { ChatActionSchema } from "@experiments/protocol-schemas/ahp";
import { asc, count, eq, gt, or, sql } from "drizzle-orm";
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
  ChatState,
  ChatAction,
  SessionAction,
} from "@experiments/protocol-schemas/ahp";
import { reduceRoot, reduceSession } from "./reducers";
import { ROOT, RpcCodes, ProtocolError } from "../ahp/protocol";
import { ActionJournal, ContentStore, ChatStore } from "../storage";
import storeMigrations from "../../drizzle/migrations";
import { IDLE, type LiveSession } from "../sessions/record";
import { projectChat, sessionSummary } from "./projections";
import { host, sessions } from "../storage/schema";
import type { InferSelectModel } from "drizzle-orm";
import { MAX_SNAPSHOT_BYTES, RESPONSE_RESERVE_BYTES, checkBytes } from "../memory";

const SEQUENCE_INCREMENT = 1;

const HOST_ID = 1;

const ACTIVE_TURN_STATUS = 8;

const MAX_SESSION_BYTES = 65_536;

type Database = ReturnType<typeof drizzle>;

type HostRow = InferSelectModel<typeof host>;

type SessionRow = InferSelectModel<typeof sessions>;

type Publication = {
  actions: [ActionEnvelope, ...ActionEnvelope[]];
  summary?: SessionSummary;
};

type Transition = { record: LiveSession; publication: Publication };

type SessionPage = { items: SessionSummary[]; nextCursor?: string };

type ListSessionsParams = { cursor?: string; limit: number };

type CreateSessionParams = {
  uri: string;
  sessionKey: string;
  provider: string;
  workingDirectory: string;
};

type CommitDispatchParams = {
  record: LiveSession;
  channel: string;
  action: StateAction;
  origin: ActionOrigin;
  frame: string;
  rejection?: string;
};

class HostStore {
  private readonly storage: DurableObjectStorage;
  private readonly db: Database;
  private readonly journal: ActionJournal;
  private readonly chats: ChatStore;
  private readonly contents: ContentStore;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
    this.db = drizzle(state.storage, { casing: "snake_case" });
    this.chats = new ChatStore(this.db);
    this.journal = new ActionJournal(this.db);
    this.contents = new ContentStore(this.db);
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

  *recoverableSessions(): Generator<LiveSession> {
    const rows = this.db
      .select({ uri: sessions.uri })
      .from(sessions)
      .where(
        or(
          sql`json_extract(${sessions.session}, '$.lifecycle') = 'creating'`,
          sql`(json_extract(${sessions.session}, '$.chats[0].status') & ${ACTIVE_TURN_STATUS}) != 0`,
        ),
      )
      .orderBy(asc(sessions.uri))
      .all();

    for (const row of rows) {
      yield this.requireMetadata(row.uri);
    }
  }

  hasSessionChannel(channel: string): boolean {
    const match = or(eq(sessions.uri, channel), eq(sessions.chatUri, channel));

    return this.db.select({ uri: sessions.uri }).from(sessions).where(match).get() !== void 0;
  }

  listSessions(input: ListSessionsParams): SessionPage {
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
      .select({
        uri: sessions.uri,
        bytes: sql<number>`LENGTH(CAST(${sessions.session} AS BLOB))`,
      })
      .from(sessions)
      .where(input.cursor === void 0 ? void 0 : gt(sessions.uri, input.cursor))
      .orderBy(asc(sessions.uri))
      .limit(input.limit + SEQUENCE_INCREMENT)
      .all();

    const page: SessionRow[] = [];
    let remaining = MAX_SNAPSHOT_BYTES - RESPONSE_RESERVE_BYTES;

    for (const row of rows) {
      if (page.length >= input.limit || row.bytes > remaining) {
        break;
      }

      const session = this.lookupSessionRecord(row.uri);

      if (session) {
        page.push(session);
        remaining -= row.bytes;
      }
    }

    const last = page.at(-SEQUENCE_INCREMENT);

    const result: SessionPage = {
      items: page.map((row) => sessionSummary(row)),
    };

    if (last !== void 0 && rows.length > page.length) {
      result.nextCursor = last.uri;
    }

    return result;
  }

  lookupWithActiveOutput(channel: string): LiveSession | null {
    const row = this.lookupSessionRecord(channel);

    if (!row) {
      return null;
    }

    return { ...row, chat: this.chats.readWithActiveOutput(row.chatUri) };
  }

  lookupMetadata(channel: string): LiveSession | null {
    const row = this.lookupSessionRecord(channel);

    if (!row) {
      return null;
    }

    return { ...row, chat: this.chats.readMetadata(row.chatUri) };
  }

  requireMetadata(channel: string): LiveSession {
    const record = this.lookupMetadata(channel);

    if (!record) {
      throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
    }

    return record;
  }

  readAgentUpdateContext(
    chat: string,
    toolId?: string,
  ): ReturnType<ChatStore["readAgentUpdateContext"]> {
    return this.chats.readAgentUpdateContext(chat, toolId);
  }

  readResource(
    uri: string,
    encoding?: "utf-8" | "base64",
  ): ReturnType<ContentStore["readResource"]> {
    return this.contents.readResource(uri, encoding);
  }

  requireWithActiveOutput(channel: string): LiveSession {
    const record = this.lookupWithActiveOutput(channel);

    if (!record) {
      throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
    }

    return record;
  }

  requireSessionRecord(channel: string): SessionRow {
    const row = this.lookupSessionRecord(channel);

    if (!row) {
      throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
    }

    return row;
  }

  hasCompletedTurn(chatUri: string, turnId: string): boolean {
    return this.chats.hasCompletedTurn(chatUri, turnId);
  }

  readSnapshots(channels: string[]): Snapshot[] {
    let bytes = RESPONSE_RESERVE_BYTES;

    for (const channel of channels) {
      bytes += this.snapshotBytes(channel);
      checkBytes(
        bytes,
        MAX_SNAPSHOT_BYTES,
        "Snapshots exceed the memory budget; initialize without chat subscriptions and subscribe with view.turns",
      );
    }

    return channels.map((channel) => this.readSnapshot(channel));
  }

  private snapshotBytes(channel: string): number {
    if (channel === ROOT) {
      return (
        this.db
          .select({ bytes: sql<number>`LENGTH(CAST(${host.root} AS BLOB))` })
          .from(host)
          .where(eq(host.id, HOST_ID))
          .get()?.bytes ?? 0
      );
    }

    const match = or(eq(sessions.uri, channel), eq(sessions.chatUri, channel));

    const row = this.db
      .select({
        uri: sessions.uri,
        chatUri: sessions.chatUri,
        bytes: sql<number>`LENGTH(CAST(${sessions.session} AS BLOB))`,
      })
      .from(sessions)
      .where(match)
      .get();

    if (!row) {
      throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
    }

    return channel === row.uri ? row.bytes : this.chats.snapshotBytes(channel);
  }

  readSnapshot(channel: string, turns?: number): Snapshot {
    let state: Snapshot["state"];

    if (channel === ROOT) {
      state = this.readHostRecord().root;
    } else {
      const row = this.lookupSessionRecord(channel);

      if (!row) {
        throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
      }

      state = row.uri === channel ? row.session : this.chats.readSnapshot(channel, turns);
    }

    return { resource: channel, state, fromSeq: this.sequence };
  }

  configureAgent(agent: AgentInfo): Publication | null {
    const agents = [agent];

    if (deepEqual(this.readHostRecord().root.agents, agents)) {
      return null;
    }

    return this.applyAction(ROOT, { type: "root/agentsChanged", agents });
  }

  createSession({ uri, sessionKey, provider, workingDirectory }: CreateSessionParams): Publication {
    return this.storage.transactionSync(() => {
      if (this.lookupSessionRecord(uri)) {
        throw new ProtocolError(RpcCodes.sessionExists, "Session already exists");
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
      this.chats.createChat(chatUri, record.chat);

      return {
        actions: [this.publishActiveSessionCount()],
        summary: sessionSummary(record),
      };
    });
  }

  bindAgentSession(uri: string, acpSession: string): void {
    this.storage.transactionSync(() => {
      const row = this.db
        .select({ uri: sessions.uri })
        .from(sessions)
        .where(eq(sessions.uri, uri))
        .get();

      if (!row) {
        throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
      }

      this.db.update(sessions).set({ acpSession }).where(eq(sessions.uri, uri)).run();
    });
  }

  deleteSession(uri: string): Publication {
    return this.storage.transactionSync(() => {
      const row = this.db.select().from(sessions).where(eq(sessions.uri, uri)).get();

      if (!row) {
        throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
      }

      this.db.delete(sessions).where(eq(sessions.uri, uri)).run();
      this.chats.deleteChat(row.chatUri);
      const publication = { actions: [this.publishActiveSessionCount()] } satisfies Publication;
      this.contents.retireChatContent(row.chatUri, this.sequence);
      this.contents.deleteRetiredContent(this.journal.retentionFloor);

      return publication;
    });
  }

  applyAction(channel: string, action: StateAction): Publication {
    return this.storage.transactionSync(() => {
      if (channel === ROOT) {
        const next = reduceRoot(this.readHostRecord().root, action);
        this.db.update(host).set({ root: next }).where(eq(host.id, 1)).run();

        const envelope = this.journal.append(channel, action);
        this.contents.deleteRetiredContent(this.journal.retentionFloor);

        return { actions: [envelope] };
      }

      return this.transition(this.requireMetadata(channel), channel, action).publication;
    });
  }

  applyChatActions(record: LiveSession, actions: ChatAction[]): Publication[] {
    return this.applyAgentActions(record, [], actions);
  }

  applyAgentActions(
    record: LiveSession,
    sessionActions: SessionAction[],
    chatActions: ChatAction[],
  ): Publication[] {
    return this.storage.transactionSync(() => {
      let current = record;
      const publications: Publication[] = [];

      for (const action of sessionActions) {
        const result = this.transition(current, current.uri, action);
        current = result.record;
        publications.push(result.publication);
      }

      const normalized = this.contents.storeActionContent(current.chatUri, chatActions);

      for (const action of normalized) {
        const result = this.transition(current, current.chatUri, action);
        current = result.record;
        publications.push(result.publication);
      }

      return publications;
    });
  }

  publishHistoryPage(channel: string, cursor?: string): Publication | null {
    if (
      !this.db
        .select({ uri: sessions.uri })
        .from(sessions)
        .where(eq(sessions.chatUri, channel))
        .get()
    ) {
      throw new ProtocolError(RpcCodes.params, "Invalid turn-history channel");
    }

    if (cursor === void 0) {
      return null;
    }

    return this.storage.transactionSync(() => {
      const page: Pick<ChatState, "turns" | "turnsNextCursor"> = this.chats.readHistoryPage(
        channel,
        cursor,
      );

      const envelope = this.journal.append(channel, { type: "chat/turnsLoaded", ...page });
      this.contents.deleteRetiredContent(this.journal.retentionFloor);

      return { actions: [envelope] };
    });
  }

  readReplay(since: number, channels: string[]): ActionEnvelope[] | null {
    return this.journal.readReplay(since, channels);
  }

  lookupDispatchResult(origin: ActionOrigin): { frame: string; envelope: ActionEnvelope } | null {
    return this.journal.lookupDispatchResult(origin);
  }

  commitDispatch(input: CommitDispatchParams): Publication {
    return this.storage.transactionSync(() => {
      const { record, channel, action, origin, frame, rejection } = input;

      const publication: Publication =
        rejection === void 0
          ? this.transition(record, channel, action, origin).publication
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
      this.journal.saveDispatchResult({ origin, frame, envelope });

      return publication;
    });
  }

  private transition(
    record: LiveSession,
    channel: string,
    action: StateAction,
    origin?: ActionOrigin,
  ): Transition {
    const [normalized] =
      channel === record.chatUri
        ? this.contents.storeActionContent(record.chatUri, [action])
        : [action];

    const accepted = normalized ?? action;

    const published: [ActionEnvelope, ...ActionEnvelope[]] = [
      this.journal.append(channel, accepted, origin),
    ];

    this.contents.deleteRetiredContent(this.journal.retentionFloor);

    let next: LiveSession;

    if (channel === record.uri) {
      next = { ...record, session: reduceSession(record.session, accepted) };
    } else {
      const chat = this.chats.applyAction(record.chatUri, ChatActionSchema.parse(accepted));
      next = { ...record, chat: { ...chat, turns: [] } };
      const projected = projectChat(record, chat);

      if (projected) {
        next = { ...next, session: reduceSession(record.session, projected) };
        published.push(this.journal.append(record.uri, projected));
      }
    }

    const changed = !deepEqual(next.session, record.session);

    if (changed) {
      const sessionJson = JSON.stringify(next.session);
      const sessionBytes = new TextEncoder().encode(sessionJson).byteLength;
      checkBytes(sessionBytes, MAX_SESSION_BYTES, "Session metadata exceeds the storage budget");
      this.db
        .update(sessions)
        .set({ session: next.session, modifiedAt: new Date().toISOString() })
        .where(eq(sessions.uri, record.uri))
        .run();
    }

    const publication: Publication = { actions: published };

    if (changed) {
      publication.summary = sessionSummary(next);
    }

    return { record: next, publication };
  }

  private publishActiveSessionCount(): ActionEnvelope {
    const row = this.db.select({ value: count() }).from(sessions).get();

    const action: StateAction = {
      type: "root/activeSessionsChanged",
      activeSessions: row?.value ?? 0,
    };

    const next = reduceRoot(this.readHostRecord().root, action);
    this.db.update(host).set({ root: next }).where(eq(host.id, 1)).run();

    const envelope = this.journal.append(ROOT, action);
    this.contents.deleteRetiredContent(this.journal.retentionFloor);

    return envelope;
  }

  private lookupSessionRecord(channel: string): SessionRow | undefined {
    const match = or(eq(sessions.uri, channel), eq(sessions.chatUri, channel));

    return this.db.select().from(sessions).where(match).get();
  }

  private readHostRecord(): HostRow {
    const row = this.db.select().from(host).where(eq(host.id, HOST_ID)).get();

    if (!row) {
      throw new Error("Host storage is not initialized");
    }

    return row;
  }
}

export { HostStore, type Publication };
