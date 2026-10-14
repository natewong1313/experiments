import { AhpErrorCodes, SessionStatus } from "@microsoft/agent-host-protocol";
import type { AgentInfo, RootState } from "@microsoft/agent-host-protocol";
import type {
  CreateSessionParams,
  ListSessionsResult,
  SessionSummary,
} from "@experiments/protocol-schemas/ahp";
import { ProtocolError, ROOT_CHANNEL, errorMessage } from "../../protocol";
import { chatUri, parseChannel, sessionDOName, sessionUri } from "../../shared/lookups";
import type { ChatChannel, SessionChannel } from "../../shared/lookups";
import { HostSessionUpdateRequestSchema } from "../../shared/rpc/host";
import type { HostSessionUpdateRequest } from "../../shared/rpc/host";
import type {
  SessionDispatchRequest,
  SessionRPC,
  SessionNamespace,
} from "../../shared/rpc/session";
import type { HostDatabase } from "../db/database";
import type { SessionEntry } from "../db/schema";
import type { ChannelSnapshot, ConnectionsService } from "./connections";

type HostSessionsOptions = {
  hostId: string;
  db: HostDatabase;
  connections: ConnectionsService;
  agentInfo(): AgentInfo;
  sessionNamespace(): SessionNamespace;
};

export class HostSessionsService {
  private options: HostSessionsOptions;

  constructor(options: HostSessionsOptions) {
    this.options = options;
  }

  async serverSeq(): Promise<number> {
    return await this.options.db.host.serverSeq();
  }

  async nextSequence(): Promise<number> {
    return await this.options.db.host.nextSequence();
  }

  async list(): Promise<ListSessionsResult> {
    const entries = await this.options.db.sessions.list();

    return { items: entries.map((entry) => entry.summary) };
  }

  async snapshot(uri: string): Promise<ChannelSnapshot> {
    const channel = parseChannel(uri);
    const fromSeq = await this.options.db.host.serverSeq();

    if (channel.kind === "root") {
      return {
        snapshot: { resource: uri, state: await this.rootState(), fromSeq },
        revision: fromSeq,
      };
    }

    const entry = await this.resolveSession(channel);
    const { state, revision } = await this.sessionStub(entry.id).snapshot({ channel: uri });

    return { snapshot: { resource: uri, state, fromSeq }, revision };
  }

  async dispatch(uri: string, request: SessionDispatchRequest): Promise<void> {
    const channel = parseChannel(uri);

    if (channel.kind !== "chat") {
      throw new ProtocolError("Actions must target a chat channel");
    }

    const entry = await this.resolveSession(channel);
    await this.sessionStub(entry.id).dispatch(request);
  }

  async create(params: CreateSessionParams): Promise<void> {
    const { id } = sessionChannel(params.channel);
    const agent = this.options.agentInfo();

    if (params.provider !== undefined && params.provider !== agent.provider) {
      throw new ProtocolError("Agent provider does not exist", AhpErrorCodes.ProviderNotFound);
    }

    if (await this.options.db.sessions.get(id)) {
      throw new ProtocolError("Session already exists", AhpErrorCodes.SessionAlreadyExists);
    }

    if (params.config || params.activeClient || (params.workingDirectories?.length ?? 0) > 1) {
      throw new ProtocolError(
        "Session configuration and multiple working directories are not supported",
      );
    }

    const directory = params.workingDirectories?.[0];
    const workingDirectory = directory === undefined ? undefined : localPath(directory);
    const now = new Date().toISOString();
    const chatId = crypto.randomUUID();

    const entry: SessionEntry = {
      id,
      defaultChatId: chatId,
      summary: {
        resource: params.channel,
        provider: agent.provider,
        title: "New session",
        status: SessionStatus.Idle,
        createdAt: now,
        modifiedAt: now,
      },
    };

    // The session is listed while it is still creating, so early subscribers see its lifecycle.
    await this.options.db.sessions.create(entry);

    this.options.connections.notify(ROOT_CHANNEL, {
      jsonrpc: "2.0",
      method: "root/sessionAdded",
      params: { channel: ROOT_CHANNEL, summary: entry.summary },
    });

    await this.catalogueChanged();

    try {
      await this.sessionStub(id).create({
        hostId: this.options.hostId,
        sessionId: id,
        chatId,
        provider: agent.provider,
        createdAt: now,
        workingDirectory,
      });
    } catch (error) {
      // Report the creation failure even if cleanup also fails; disposeSession can retry it.
      await Promise.allSettled([this.dispose(entry)]);
      throw new ProtocolError(errorMessage(error));
    }
  }

  async disposeChannel(uri: string): Promise<void> {
    await this.dispose(await this.resolveSession(sessionChannel(uri)));
  }

  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    const update = HostSessionUpdateRequestSchema.parse(req);
    const entry = await this.options.db.sessions.get(update.sessionId);

    if (!entry) {
      return;
    }

    await this.options.db.sessions.update(entry.id, update.summary);

    for (const { channel, action, origin } of update.actions) {
      // Server sequences must be allocated in broadcast order.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const serverSeq = await this.options.db.host.nextSequence();

      this.options.connections.broadcast({
        envelope: { channel, action, origin, serverSeq },
        revision: update.revision,
      });
    }

    const changes = summaryChanges(entry.summary, update.summary);

    if (Object.keys(changes).length > 0) {
      this.options.connections.notify(ROOT_CHANNEL, {
        jsonrpc: "2.0",
        method: "root/sessionSummaryChanged",
        params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id), changes },
      });
    }
  }

  private async rootState(): Promise<RootState> {
    return {
      agents: [this.options.agentInfo()],
      activeSessions: await this.options.db.sessions.count(),
    };
  }

  private async resolveSession(channel: SessionChannel | ChatChannel): Promise<SessionEntry> {
    const entry =
      channel.kind === "session"
        ? await this.options.db.sessions.get(channel.id)
        : await this.options.db.sessions.findChat(channel.id);

    if (!entry) {
      throw new ProtocolError("Session does not exist", AhpErrorCodes.SessionNotFound);
    }

    return entry;
  }

  private sessionStub(id: string): SessionRPC {
    return this.options.sessionNamespace().getByName(sessionDOName(this.options.hostId, id));
  }

  private async dispose(entry: SessionEntry): Promise<void> {
    await this.sessionStub(entry.id).dispose();
    await this.options.db.sessions.remove(entry.id);
    this.options.connections.removeChannel(sessionUri(entry.id));
    this.options.connections.removeChannel(chatUri(entry.defaultChatId));

    this.options.connections.notify(ROOT_CHANNEL, {
      jsonrpc: "2.0",
      method: "root/sessionRemoved",
      params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id) },
    });

    await this.catalogueChanged();
  }

  private async catalogueChanged(): Promise<void> {
    const activeSessions = await this.options.db.sessions.count();
    const serverSeq = await this.options.db.host.nextSequence();

    this.options.connections.broadcast({
      revision: serverSeq,
      envelope: {
        channel: ROOT_CHANNEL,
        serverSeq,
        action: { type: "root/activeSessionsChanged", activeSessions },
      },
    });
  }
}

function sessionChannel(uri: string): SessionChannel {
  const channel = parseChannel(uri);

  if (channel.kind !== "session") {
    throw new ProtocolError("Expected an ahp-session channel");
  }

  return channel;
}

function localPath(directory: string): string {
  const url = new URL(directory);

  if (url.protocol !== "file:" || url.hostname || url.search || url.hash) {
    throw new ProtocolError("Expected a local file working directory");
  }

  return decodeURIComponent(url.pathname);
}

// Identity fields never change, so only mutable fields that differ are reported.
function summaryChanges(previous: SessionSummary, next: SessionSummary): Partial<SessionSummary> {
  const { resource: _resource, provider: _provider, createdAt: _createdAt, ...mutable } = next;
  const before = new Map(Object.entries(previous));

  return Object.fromEntries(
    Object.entries(mutable).filter(
      ([key, value]) => JSON.stringify(before.get(key)) !== JSON.stringify(value),
    ),
  );
}
