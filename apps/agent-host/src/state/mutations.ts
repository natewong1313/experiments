import { ChatActionSchema } from "@experiments/protocol-schemas/ahp";
import { deepEqual } from "fast-equals";
import type {
  ActionEnvelope,
  ActionOrigin,
  AgentInfo,
  StateAction,
  ChatState,
  ChatAction,
  SessionAction,
} from "@experiments/protocol-schemas/ahp";
import { reduceRoot, reduceSession } from "./reducers";
import { ROOT, RpcCodes, ProtocolError } from "../ahp/protocol";
import type { Publication } from "./publication";
import type { LiveSession } from "./records";
import { projectChat, sessionSummary } from "./projections";
import type { StateDatabase } from "./persistence/database";
import type { RootStore } from "./host/root-store";
import type { SessionStore } from "./host/session-store";
import type { ActionJournal } from "./replay/journal";
import type { ResourceStore } from "./content/resource-store";
import type { ActionContent } from "./content/action-content";
import type { ChatTransitions } from "./chat/transitions";
import type { HostQueries } from "./queries";

const IDLE = 1;

type Transition = { record: LiveSession; publication: Publication };

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

type HostMutationsParams = {
  database: StateDatabase;
  root: RootStore;
  sessions: SessionStore;
  journal: ActionJournal;
  resources: ResourceStore;
  content: ActionContent;
  transitions: ChatTransitions;
  queries: HostQueries;
};

export class HostMutations {
  private readonly database: StateDatabase;
  private readonly root: RootStore;
  private readonly sessions: SessionStore;
  private readonly journal: ActionJournal;
  private readonly resources: ResourceStore;
  private readonly content: ActionContent;
  private readonly transitions: ChatTransitions;
  private readonly queries: HostQueries;

  constructor({
    database,
    root,
    sessions,
    journal,
    resources,
    content,
    transitions,
    queries,
  }: HostMutationsParams) {
    this.database = database;
    this.root = root;
    this.sessions = sessions;
    this.journal = journal;
    this.resources = resources;
    this.content = content;
    this.transitions = transitions;
    this.queries = queries;
  }

  configureAgent(agent: AgentInfo): Publication | null {
    const agents = [agent];

    if (deepEqual(this.root.readRoot().agents, agents)) {
      return null;
    }

    return this.applyAction(ROOT, { type: "root/agentsChanged", agents });
  }

  createSession({ uri, sessionKey, provider, workingDirectory }: CreateSessionParams): Publication {
    return this.database.transaction(() => {
      if (this.sessions.lookupSession(uri)) {
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

      this.sessions.insertSession({
        uri,
        chatUri,
        sessionKey,
        acpSession: null,
        createdAt: now,
        modifiedAt: now,
        session,
      });
      this.transitions.createChat(chatUri, record.chat);

      return {
        actions: [this.publishActiveSessionCount()],
        summary: sessionSummary(record),
      };
    });
  }

  bindAgentSession(uri: string, acpSession: string): void {
    this.database.transaction(() => {
      if (!this.sessions.hasSession(uri)) {
        throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
      }

      this.sessions.bindAgentSession(uri, acpSession);
    });
  }

  deleteSession(uri: string): Publication {
    return this.database.transaction(() => {
      const row = this.sessions.lookupSession(uri);

      if (!row || row.uri !== uri) {
        throw new ProtocolError(RpcCodes.sessionMissing, "Session does not exist");
      }

      this.sessions.deleteSession(uri);
      this.transitions.deleteChat(row.chatUri);
      const publication = { actions: [this.publishActiveSessionCount()] } satisfies Publication;
      this.resources.retireChatContent(row.chatUri, this.journal.sequence);
      this.resources.deleteRetiredContent(this.journal.retentionFloor);

      return publication;
    });
  }

  applyAction(channel: string, action: StateAction): Publication {
    return this.database.transaction(() => {
      if (channel === ROOT) {
        const next = reduceRoot(this.root.readRoot(), action);
        this.root.writeRoot(next);

        const envelope = this.journal.append(channel, action);
        this.resources.deleteRetiredContent(this.journal.retentionFloor);

        return { actions: [envelope] };
      }

      return this.transition(this.queries.requireMetadata(channel), channel, action).publication;
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
    return this.database.transaction(() => {
      let current = record;
      const publications: Publication[] = [];

      for (const action of sessionActions) {
        const result = this.transition(current, current.uri, action);
        current = result.record;
        publications.push(result.publication);
      }

      const normalized = this.content.storeActionContent(current.chatUri, chatActions);

      for (const action of normalized) {
        const result = this.transition(current, current.chatUri, action);
        current = result.record;
        publications.push(result.publication);
      }

      return publications;
    });
  }

  publishHistoryPage(channel: string, cursor?: string): Publication | null {
    if (!this.sessions.hasChat(channel)) {
      throw new ProtocolError(RpcCodes.params, "Invalid turn-history channel");
    }

    if (cursor === void 0) {
      return null;
    }

    return this.database.transaction(() => {
      const page: Pick<ChatState, "turns" | "turnsNextCursor"> = this.queries.readHistoryPage(
        channel,
        cursor,
      );

      const envelope = this.journal.append(channel, { type: "chat/turnsLoaded", ...page });
      this.resources.deleteRetiredContent(this.journal.retentionFloor);

      return { actions: [envelope] };
    });
  }

  commitDispatch(input: CommitDispatchParams): Publication {
    return this.database.transaction(() => {
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
                  serverSeq: this.journal.sequence,
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
        ? this.content.storeActionContent(record.chatUri, [action])
        : [action];

    const accepted = normalized ?? action;

    const published: [ActionEnvelope, ...ActionEnvelope[]] = [
      this.journal.append(channel, accepted, origin),
    ];

    this.resources.deleteRetiredContent(this.journal.retentionFloor);

    let next: LiveSession;

    if (channel === record.uri) {
      next = { ...record, session: reduceSession(record.session, accepted) };
    } else {
      const chat = this.transitions.applyAction(record.chatUri, ChatActionSchema.parse(accepted));
      next = { ...record, chat: { ...chat, turns: [] } };
      const projected = projectChat(record, chat);

      if (projected) {
        next = { ...next, session: reduceSession(record.session, projected) };
        published.push(this.journal.append(record.uri, projected));
      }
    }

    const changed = !deepEqual(next.session, record.session);

    if (changed) {
      this.sessions.writeSession(record.uri, next.session);
    }

    const publication: Publication = { actions: published };

    if (changed) {
      publication.summary = sessionSummary(next);
    }

    return { record: next, publication };
  }

  private publishActiveSessionCount(): ActionEnvelope {
    const action: StateAction = {
      type: "root/activeSessionsChanged",
      activeSessions: this.sessions.sessionCount(),
    };

    const next = reduceRoot(this.root.readRoot(), action);
    this.root.writeRoot(next);

    const envelope = this.journal.append(ROOT, action);
    this.resources.deleteRetiredContent(this.journal.retentionFloor);

    return envelope;
  }
}
