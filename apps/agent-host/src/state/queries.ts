import type { Snapshot, SessionSummary, ActionOrigin } from "@experiments/protocol-schemas/ahp";
import type { SessionRecord, LiveSession } from "./records";
import { ROOT, RpcCodes, ProtocolError } from "../ahp/protocol";
import { sessionSummary } from "./projections";
import { MAX_SNAPSHOT_BYTES, RESPONSE_RESERVE_BYTES, checkBytes } from "../memory";
import type { RootStore } from "./host/root-store";
import type { SessionStore } from "./host/session-store";
import type { ChatStore } from "./chat/chat-store";
import type { TurnStore } from "./chat/turn-store";
import type { PartsStore } from "./chat/parts-store";
import type { TurnHistory } from "./chat/history";
import type { ChatSnapshots } from "./chat/snapshots";
import type { ActionJournal } from "./replay/journal";
import type { ResourceStore } from "./content/resource-store";

type HostQueriesParams = {
  root: RootStore;
  sessions: SessionStore;
  chats: ChatStore;
  turns: TurnStore;
  parts: PartsStore;
  history: TurnHistory;
  snapshots: ChatSnapshots;
  journal: ActionJournal;
  resources: ResourceStore;
};

const SEQUENCE_INCREMENT = 1;

const ACTIVE_TURN_STATUS = 8;

type AgentUpdateContext = {
  partCount: number;
  lastPart?: ReturnType<PartsStore["readLastTextIdentity"]>;
  toolExists: boolean;
};

type SessionPage = { items: SessionSummary[]; nextCursor?: string };

type ListSessionsParams = { cursor?: string; limit: number };

class HostQueries {
  private readonly root: RootStore;
  private readonly sessions: SessionStore;
  private readonly chats: ChatStore;
  private readonly turns: TurnStore;
  private readonly parts: PartsStore;
  private readonly history: TurnHistory;
  private readonly snapshots: ChatSnapshots;
  private readonly journal: ActionJournal;
  private readonly resources: ResourceStore;

  constructor({
    root,
    sessions,
    chats,
    turns,
    parts,
    history,
    snapshots,
    journal,
    resources,
  }: HostQueriesParams) {
    this.root = root;
    this.sessions = sessions;
    this.chats = chats;
    this.turns = turns;
    this.parts = parts;
    this.history = history;
    this.snapshots = snapshots;
    this.journal = journal;
    this.resources = resources;
  }

  get sequence(): number {
    return this.journal.sequence;
  }

  hasSessionChannel(channel: string): boolean {
    return this.sessions.hasSessionChannel(channel);
  }

  hasCompletedTurn(uri: string, turnId: string): boolean {
    return this.history.hasCompletedTurn(uri, turnId);
  }

  readHistoryPage(uri: string, cursor: string): ReturnType<TurnHistory["readPage"]> {
    return this.history.readPage(uri, cursor);
  }

  lookupDispatchResult(origin: ActionOrigin): ReturnType<ActionJournal["lookupDispatchResult"]> {
    return this.journal.lookupDispatchResult(origin);
  }

  readReplay(since: number, channels: string[]): ReturnType<ActionJournal["readReplay"]> {
    return this.journal.readReplay(since, channels);
  }

  readResource(
    uri: string,
    encoding?: Parameters<ResourceStore["readResource"]>[1],
  ): ReturnType<ResourceStore["readResource"]> {
    return this.resources.readResource(uri, encoding);
  }

  readAgentUpdateContext(uri: string, toolId?: string): AgentUpdateContext {
    const chat = this.chats.readMetadata(uri);

    if (!chat.activeTurn) {
      return { partCount: 0, toolExists: false };
    }

    const turn = this.turns.readTurnRecord(uri, chat.activeTurn.id);

    return {
      partCount: turn.partCount,
      lastPart: this.parts.readLastTextIdentity(uri, chat.activeTurn.id, turn.partCount),
      toolExists:
        toolId !== void 0 &&
        this.parts
          .findByIdentity(uri, chat.activeTurn.id, toolId)
          .some((row) => row.kind === "toolCall"),
    };
  }

  *recoverableSessions(): Generator<LiveSession> {
    const rows = this.sessions.recoverableSessionUris(ACTIVE_TURN_STATUS);

    for (const row of rows) {
      yield this.requireMetadata(row.uri);
    }
  }

  listSessions(input: ListSessionsParams): SessionPage {
    if (input.cursor !== void 0 && !this.sessions.hasSession(input.cursor)) {
      throw new ProtocolError(RpcCodes.params, "Invalid session cursor");
    }

    const rows = this.sessions.sessionCandidates(input);

    const page: SessionRecord[] = [];
    let remaining = MAX_SNAPSHOT_BYTES - RESPONSE_RESERVE_BYTES;

    for (const row of rows) {
      if (page.length >= input.limit || row.bytes > remaining) {
        break;
      }

      const session = this.sessions.lookupSession(row.uri);

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
    const row = this.sessions.lookupSession(channel);

    if (!row) {
      return null;
    }

    return { ...row, chat: this.snapshots.readWithActiveOutput(row.chatUri) };
  }

  lookupMetadata(channel: string): LiveSession | null {
    const row = this.sessions.lookupSession(channel);

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

  requireWithActiveOutput(channel: string): LiveSession {
    const record = this.lookupWithActiveOutput(channel);

    if (!record) {
      throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
    }

    return record;
  }

  requireSessionRecord(channel: string): SessionRecord {
    const row = this.sessions.lookupSession(channel);

    if (!row) {
      throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
    }

    return row;
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
      return this.root.rootBytes();
    }

    const row = this.sessions.sessionBytes(channel);

    if (!row) {
      throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
    }

    return channel === row.uri ? row.bytes : this.snapshots.snapshotBytes(channel);
  }

  readSnapshot(channel: string, turns?: number): Snapshot {
    let state: Snapshot["state"];

    if (channel === ROOT) {
      state = this.root.readRoot();
    } else {
      const row = this.sessions.lookupSession(channel);

      if (!row) {
        throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
      }

      state = row.uri === channel ? row.session : this.snapshots.readSnapshot(channel, turns);
    }

    return { resource: channel, state, fromSeq: this.journal.sequence };
  }
}

export { HostQueries };
