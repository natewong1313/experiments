import * as z from "zod";
import { StateActionSchema, SessionSummarySchema } from "@experiments/protocol-schemas/ahp";
import { AhpErrorCodes, SessionStatus } from "@microsoft/agent-host-protocol";
import type { AgentInfo, RootState } from "@microsoft/agent-host-protocol";
import type {
  CreateSessionParams,
  ListSessionsResult,
  Snapshot,
} from "@experiments/protocol-schemas/ahp";
import { ProtocolError, ROOT_CHANNEL, errorMessage } from "../../protocol";
import { sessionDOName, sessionUri, chatUri } from "../../shared/lookups";
import type { SessionRPC, SessionNamespace } from "../../shared/rpc/session";
import type { HostRepository } from "../db/repositories/host";
import type { SessionsRepository } from "../db/repositories/sessions";
import type { SessionEntry } from "../db/schema";
import type { ConnectionsService } from "./connections";
import type { HostSessionUpdateRequest } from "../../shared/rpc/host";

const UUIDSchema = z.uuid().transform((id) => id.toLowerCase());

type SessionOptions = {
  host: HostRepository;
  sessions: SessionsRepository;
  connections: ConnectionsService;
  agentInfo(): AgentInfo;
  sessionNamespace(): SessionNamespace;
};

type SnapshotResult = { snapshot: Snapshot; revision: number };

export class HostSessionsService {
  private options: SessionOptions;

  constructor(options: SessionOptions) {
    this.options = options;
  }

  async rootState(): Promise<RootState> {
    const sessions = await this.options.sessions.list();

    return {
      agents: [this.options.agentInfo()],
      activeSessions: sessions.length,
    };
  }

  async sessionStub(id: string): Promise<SessionRPC> {
    const host = await this.options.host.get();
    if (!host) {
      throw new ProtocolError("Host is not initialized");
    }

    return this.options.sessionNamespace().getByName(sessionDOName(host.id, id));
  }

  async resolveSession(channel: string): Promise<SessionEntry> {
    const entry = channel.startsWith("ahp-session:/")
      ? await this.options.sessions.get(sessionChannelId(channel))
      : await this.options.sessions.findChat(chatChannelId(channel));

    if (!entry) {
      throw new ProtocolError("Session does not exist", AhpErrorCodes.SessionNotFound);
    }

    return entry;
  }

  async list(): Promise<ListSessionsResult> {
    const entries = await this.options.sessions.list();

    return { items: entries.map((entry) => entry.summary) };
  }

  async snapshot(channel: string): Promise<SnapshotResult> {
    const currentHost = await this.options.host.get();
    const fromSeq = currentHost?.serverSeq ?? 0;

    if (channel === ROOT_CHANNEL) {
      return {
        snapshot: { resource: channel, state: await this.rootState(), fromSeq },
        revision: fromSeq,
      };
    }

    const entry = await this.resolveSession(channel);
    const stub = await this.sessionStub(entry.id);
    const response = await stub.snapshot({ channel });

    return {
      snapshot: { resource: channel, state: response.state, fromSeq },
      revision: response.revision,
    };
  }

  async create(params: CreateSessionParams): Promise<void> {
    const id = sessionChannelId(params.channel);
    const agent = this.options.agentInfo();

    if (params.provider !== undefined && params.provider !== agent.provider) {
      throw new ProtocolError("Agent provider does not exist", AhpErrorCodes.ProviderNotFound);
    }

    if (await this.options.sessions.get(id)) {
      throw new ProtocolError("Session already exists", AhpErrorCodes.SessionAlreadyExists);
    }

    if (params.config || params.activeClient || (params.workingDirectories?.length ?? 0) > 1) {
      throw new ProtocolError(
        "Session configuration and multiple working directories are not supported",
      );
    }

    const directory = params.workingDirectories?.[0];
    let workingDirectory: string | undefined;

    if (directory !== undefined) {
      const url = new URL(directory);

      if (url.protocol !== "file:" || url.hostname || url.search || url.hash) {
        throw new ProtocolError("Expected a local file working directory");
      }

      workingDirectory = decodeURIComponent(url.pathname);
    }

    const currentHost = await this.options.host.get();
    const hostId = currentHost?.id;

    if (hostId === undefined) {
      throw new ProtocolError("Host is not initialized");
    }

    const now = new Date().toISOString();
    const chatId = crypto.randomUUID();

    const entry = {
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

    await this.options.sessions.create(entry);
    this.sessionAdded(entry);
    await this.catalogueChanged();

    try {
      const stub = await this.sessionStub(id);
      await stub.create({
        hostId,
        sessionId: id,
        chatId,
        provider: agent.provider,
        createdAt: now,
        workingDirectory,
      });
    } catch (error) {
      await this.dispose(entry);
      throw new ProtocolError(errorMessage(error));
    }
  }

  async disposeChannel(channel: string): Promise<void> {
    const id = sessionChannelId(channel);
    const entry = await this.options.sessions.get(id);

    if (!entry) {
      throw new ProtocolError("Session does not exist", AhpErrorCodes.SessionNotFound);
    }

    await this.dispose(entry);
  }

  async dispose(entry: SessionEntry): Promise<void> {
    const stub = await this.sessionStub(entry.id);
    await stub.dispose();
    await this.options.sessions.remove(entry.id);
    this.sessionRemoved(entry);
    await this.catalogueChanged();
  }

  async sessionUpdate(req: HostSessionUpdateRequest): Promise<void> {
    const parsed = z
      .object({
        sessionId: z.string(),
        revision: z.number(),
        summary: SessionSummarySchema,
        actions: z.array(
          z.object({
            channel: z.string(),
            action: StateActionSchema,
            origin: z.object({ clientId: z.string(), clientSeq: z.number() }).optional(),
          }),
        ),
      })
      .parse(req);

    const publication = parsed;
    const entry = await this.options.sessions.get(publication.sessionId);

    if (!entry) {
      return;
    }

    await this.options.sessions.update(entry.id, req.summary);

    await Promise.all(
      publication.actions.map(async (item) => {
        const envelope = {
          ...item,
          serverSeq: await this.options.host.nextSequence(),
          origin: item.origin,
        };

        this.options.connections.broadcast({ envelope, revision: publication.revision });
      }),
    );

    if (JSON.stringify(entry.summary) !== JSON.stringify(publication.summary)) {
      const {
        resource: _resource,
        createdAt: _createdAt,
        provider: _provider,
        ...changes
      } = publication.summary;

      this.options.connections.notify(ROOT_CHANNEL, {
        jsonrpc: "2.0",
        method: "root/sessionSummaryChanged",
        params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id), changes },
      });
    }
  }

  async catalogueChanged(): Promise<void> {
    const sessions = await this.options.sessions.list();
    const serverSeq = await this.options.host.nextSequence();
    this.options.connections.broadcast({
      revision: serverSeq,
      envelope: {
        channel: ROOT_CHANNEL,
        serverSeq,
        action: {
          type: "root/activeSessionsChanged",
          activeSessions: sessions.length,
        },
      },
    });
  }

  private sessionAdded(entry: SessionEntry): void {
    this.options.connections.notify(ROOT_CHANNEL, {
      jsonrpc: "2.0",
      method: "root/sessionAdded",
      params: { channel: ROOT_CHANNEL, summary: entry.summary },
    });
  }

  private sessionRemoved(entry: SessionEntry): void {
    this.options.connections.removeChannel(sessionUri(entry.id));
    this.options.connections.removeChannel(chatUri(entry.defaultChatId));
    this.options.connections.notify(ROOT_CHANNEL, {
      jsonrpc: "2.0",
      method: "root/sessionRemoved",
      params: { channel: ROOT_CHANNEL, session: sessionUri(entry.id) },
    });
  }
}

function sessionChannelId(channel: string): string {
  return buildChannelId(channel, "ahp-session");
}

function chatChannelId(channel: string): string {
  return buildChannelId(channel, "ahp-chat");
}

function buildChannelId(channel: string, scheme: "ahp-session" | "ahp-chat"): string {
  const prefix = `${scheme}:/`;
  if (!channel.startsWith(prefix)) {
    throw new ProtocolError(`Expected a ${scheme} channel`);
  }

  const id = UUIDSchema.parse(channel.slice(prefix.length));
  if (channel !== `${prefix}${id}`) {
    throw new ProtocolError("Channel UUID must use lowercase canonical form");
  }

  return id;
}
