import {
  AhpErrorCodes as AHPErrorCodes,
  SessionStatus as AHPSessionStatus,
} from "@microsoft/agent-host-protocol";
import type {
  AgentInfo as AHPAgentInfo,
  RootState as AHPRootState,
} from "@microsoft/agent-host-protocol";
import type { JsonRpcNotification } from "@experiments/protocol-schemas";
import type {
  ActionEnvelope as AHPActionEnvelope,
  CreateSessionParams as AHPCreateSessionParams,
  DispatchActionParams as AHPDispatchActionParams,
  ListSessionsResult as AHPListSessionsResult,
  SessionSummary as AHPSessionSummary,
} from "@experiments/protocol-schemas/ahp";
import { AHPError, ROOT_CHANNEL } from "../../shared/protocol";
import { errorMessage } from "../../shared/errors";
import { chatUri, parseChannel, sessionDOName, sessionUri } from "../../shared/lookups";
import type { ChatChannel, SessionChannel } from "../../shared/lookups";
import { HostSessionUpdateRequestSchema } from "../../shared/rpc/host";
import type { HostSessionUpdateRequest } from "../../shared/rpc/host";
import { SessionDispatchActionSchema } from "../../shared/rpc/session";
import type { SessionRPC, SessionNamespace } from "../../shared/rpc/session";
import type { HostDatabase } from "../db/database";
import type { SessionEntry } from "../db/schema";
import type { ChannelSnapshot, ConnectionsService } from "./connections";

type HostSessionsOptions = {
  hostId: string;
  db: HostDatabase;
  connections: ConnectionsService;
  agentInfo(): AHPAgentInfo;
  sessionNamespace(): SessionNamespace;
};

type CreateParams = { id: string; workingDirectory: string | undefined };

/**
 * Controls the session catalog of one host.
 * It stores the catalog, sends requests to the session Durable Objects, and publishes
 * catalog changes to subscribers.
 */
export class HostSessionsService {
  private hostId: string;
  private db: HostDatabase;
  private connections: ConnectionsService;
  private agentInfo: () => AHPAgentInfo;
  private sessionNamespace: () => SessionNamespace;

  constructor(options: HostSessionsOptions) {
    this.hostId = options.hostId;
    this.db = options.db;
    this.connections = options.connections;
    this.agentInfo = (): AHPAgentInfo => options.agentInfo();
    this.sessionNamespace = (): SessionNamespace => options.sessionNamespace();
  }

  /**
   * Returns the last server sequence of the host.
   * Before the first allocation, the value is 0.
   */
  async serverSeq(): Promise<number> {
    return await this.db.host.serverSeq();
  }

  async nextServerSeq(): Promise<number> {
    return this.db.host.nextServerSeq();
  }

  /**
   * Returns the summary of each session in the catalog.
   */
  async list(): Promise<AHPListSessionsResult> {
    return { items: await this.db.sessions.listSummaries() };
  }

  /**
   * Returns the snapshot of a channel and the revision of that snapshot.
   * The host makes the root snapshot. The session Durable Object makes session and chat snapshots.
   *
   * @throws {AHPError} If the channel is not valid or its session does not exist.
   */
  async snapshot(channel: string): Promise<ChannelSnapshot> {
    const parsed = parseChannel(channel);
    const fromSeq = await this.db.host.serverSeq();

    if (parsed.kind === "root") {
      return {
        snapshot: { resource: channel, state: await this.rootState(), fromSeq },
        revision: fromSeq,
      };
    }

    const entry = await this.resolveSession(parsed);
    const { state, revision } = await this.sessionStub(entry.id).snapshot({ channel });

    return { snapshot: { resource: channel, state, fromSeq }, revision };
  }

  /**
   * Sends a client action to the session that owns the chat channel.
   * Subscribers receive accepted actions as broadcasts.
   *
   * @throws {Error} If the channel, action, or session state does not permit the dispatch.
   */
  async dispatch(params: AHPDispatchActionParams, clientId: string): Promise<void> {
    const { channel, clientSeq, action } = params;
    const origin = { clientId, clientSeq };

    const parsed = parseChannel(channel);

    if (parsed.kind !== "chat") {
      throw new AHPError("Actions must target a chat channel");
    }

    const entry = await this.resolveSession(parsed);

    await this.sessionStub(entry.id).dispatch({
      action: SessionDispatchActionSchema.parse(action),
      origin,
    });
  }

  /**
   * Adds a session to the catalog and creates its session Durable Object.
   * Subscribers receive the new session before it is ready, so they can see its lifecycle.
   * If the session Durable Object fails, this method removes the session from the catalog.
   *
   * @throws {AHPError} If the parameters are not valid, the session exists, or creation fails.
   */
  async create(params: AHPCreateSessionParams): Promise<void> {
    const { provider } = this.agentInfo();
    const { id, workingDirectory } = parseCreateParams(params, provider);

    if (this.db.sessions.get(id)) {
      throw new AHPError("Session already exists", AHPErrorCodes.SessionAlreadyExists);
    }

    const now = new Date().toISOString();
    const chatId = crypto.randomUUID();

    const entry: SessionEntry = {
      id,
      revision: 0,
      defaultChatId: chatId,
      summary: {
        resource: params.channel,
        provider,
        title: "New session",
        status: AHPSessionStatus.Idle,
        createdAt: now,
        modifiedAt: now,
      },
    };

    // The session is listed while it is still creating, so early subscribers see its lifecycle.
    await this.db.sessions.create(entry);

    await this.publishCatalogChange({
      jsonrpc: "2.0",
      method: "root/sessionAdded",
      params: { channel: ROOT_CHANNEL, summary: entry.summary },
    });

    try {
      await this.sessionStub(id).create({
        hostId: this.hostId,
        sessionId: id,
        chatId,
        provider,
        createdAt: now,
        workingDirectory,
      });
    } catch (error) {
      // Report the creation failure even if cleanup also fails; disposeSession can retry it.
      await Promise.allSettled([this.remove(entry)]);
      throw new AHPError(errorMessage(error));
    }
  }

  /**
   * Disposes the session Durable Object and removes the session from the catalog.
   *
   * @throws {AHPError} If the channel is not a session channel or the session does not exist.
   */
  async dispose(channel: string): Promise<void> {
    await this.remove(await this.resolveSession(sessionChannel(channel)));
  }

  /**
   * Applies an update from a session Durable Object.
   * This method stores the new summary, broadcasts each action, and sends the summary fields
   * that changed. If the session is not in the catalog, this method ignores the update.
   */
  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    const update = HostSessionUpdateRequestSchema.parse(req);

    const accepted = this.db.transactionSync(() => {
      const entry = this.db.sessions.get(update.sessionId);

      if (
        !entry ||
        update.revision <= entry.revision ||
        update.summary.createdAt !== entry.summary.createdAt ||
        (update.defaultChat !== undefined && update.defaultChat !== chatUri(entry.defaultChatId))
      ) {
        return;
      }

      this.db.sessions.update({ id: entry.id, summary: update.summary, revision: update.revision });

      const actions = update.actions.map((action) => ({
        ...action,
        serverSeq: this.db.host.nextServerSeq(),
      }));

      return { entry, actions };
    });

    if (!accepted) {
      return;
    }

    for (const action of accepted.actions) {
      this.publishAction(action, update.revision);
    }

    const { entry } = accepted;
    const changes = summaryChanges(entry.summary, update.summary);

    if (Object.keys(changes).length > 0) {
      this.notifyRoot({
        jsonrpc: "2.0",
        method: "root/sessionSummaryChanged",
        params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id), changes },
      });
    }
  }

  private async rootState(): Promise<AHPRootState> {
    return {
      agents: [this.agentInfo()],
      activeSessions: await this.db.sessions.count(),
    };
  }

  /**
   * Finds the catalog entry for a session channel or for the default chat of a session.
   *
   * @throws {AHPError} If the session does not exist.
   */
  private async resolveSession(parsed: SessionChannel | ChatChannel): Promise<SessionEntry> {
    const entry =
      parsed.kind === "session"
        ? this.db.sessions.get(parsed.id)
        : await this.db.sessions.findChat(parsed.id);

    if (!entry) {
      throw new AHPError("Session does not exist", AHPErrorCodes.SessionNotFound);
    }

    return entry;
  }

  private sessionStub(id: string): SessionRPC {
    return this.sessionNamespace().getByName(sessionDOName(this.hostId, id));
  }

  /**
   * Disposes the session Durable Object, then removes the session from the catalog.
   * All sockets stop their subscriptions to the session channel and the chat channel.
   */
  private async remove(entry: SessionEntry): Promise<void> {
    await this.sessionStub(entry.id).dispose();
    await this.db.sessions.remove(entry.id);
    this.connections.removeChannel(sessionUri(entry.id));
    this.connections.removeChannel(chatUri(entry.defaultChatId));

    await this.publishCatalogChange({
      jsonrpc: "2.0",
      method: "root/sessionRemoved",
      params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id) },
    });
  }

  /**
   * Sends a notification about a session that the host added or removed.
   * Then broadcasts the new number of active sessions.
   */
  private async publishCatalogChange(notification: JsonRpcNotification): Promise<void> {
    this.notifyRoot(notification);
    const activeSessions = await this.db.sessions.count();
    const serverSeq = this.db.host.nextServerSeq();

    this.publishAction(
      {
        channel: ROOT_CHANNEL,
        serverSeq,
        action: { type: "root/activeSessionsChanged", activeSessions },
      },
      serverSeq,
    );
  }

  private notifyRoot(notification: JsonRpcNotification): void {
    this.connections.publish({ channel: ROOT_CHANNEL, message: notification });
  }

  private publishAction(envelope: AHPActionEnvelope, revision: number): void {
    this.connections.publish({
      channel: envelope.channel,
      revision,
      message: { jsonrpc: "2.0", method: "action", params: envelope },
    });
  }
}

/**
 * Validates the create parameters and returns the session ID and the working directory.
 *
 * @throws {AHPError} If the host does not support the parameters.
 */
function parseCreateParams(params: AHPCreateSessionParams, provider: string): CreateParams {
  const { id } = sessionChannel(params.channel);

  if (params.provider !== undefined && params.provider !== provider) {
    throw new AHPError("Agent provider does not exist", AHPErrorCodes.ProviderNotFound);
  }

  if (params.config || params.activeClient || (params.workingDirectories?.length ?? 0) > 1) {
    throw new AHPError("Session configuration and multiple working directories are not supported");
  }

  const directory = params.workingDirectories?.[0];

  return { id, workingDirectory: directory === undefined ? undefined : localPath(directory) };
}

/**
 * Parses a session channel.
 *
 * @throws {AHPError} If the channel is not a session channel.
 */
function sessionChannel(channel: string): SessionChannel {
  const parsed = parseChannel(channel);

  if (parsed.kind !== "session") {
    throw new AHPError("Expected an ahp-session channel");
  }

  return parsed;
}

/**
 * Converts a local `file:` URI to a file system path.
 *
 * @throws {AHPError} If the URI is not a local file URI.
 */
function localPath(directory: string): string {
  const url = new URL(directory);

  if (url.protocol !== "file:" || url.hostname || url.search || url.hash) {
    throw new AHPError("Expected a local file working directory");
  }

  return decodeURIComponent(url.pathname);
}

/**
 * Returns the summary fields that changed.
 * Identity fields do not change, so this function does not compare them.
 */
function summaryChanges(
  previous: AHPSessionSummary,
  next: AHPSessionSummary,
): Partial<AHPSessionSummary> {
  const { resource: _resource, provider: _provider, createdAt: _createdAt, ...mutable } = next;
  const before = new Map(Object.entries(previous));

  return Object.fromEntries(
    Object.entries(mutable).filter(
      ([key, value]) => JSON.stringify(before.get(key)) !== JSON.stringify(value),
    ),
  );
}
