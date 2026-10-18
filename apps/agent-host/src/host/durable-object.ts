/* oxlint-disable import/max-dependencies -- The host owns session creation and its RPC error handling. */
import { DurableObject } from "cloudflare:workers";
import { DurabilityAlarms } from "durability";
import {
  AhpErrorCodes as AHPErrorCodes,
  SessionStatus as AHPSessionStatus,
} from "@microsoft/agent-host-protocol";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import {
  type CreateSessionParams as AHPCreateSessionParams,
  type ListSessionsResult as AHPListSessionsResult,
  type SessionSummary as AHPSessionSummary,
  CreateSessionParamsSchema as AHPCreateSessionParamsSchema,
} from "@experiments/protocol-schemas/ahp";
import {
  HostCreateSessionError,
  HostDisposeSessionError,
  HostListSessionsError,
  HostSubscribeRootError,
  HostSummaryChangedError,
  HostSummaryChangedRequestSchema,
} from "../shared/rpc/host";
import type {
  HostDisposeSessionRequest,
  HostRPC,
  HostSubscribeRootRequest,
  HostSubscribeRootResponse,
  HostSummaryChangedRequest,
  HostUnsubscribeRootRequest,
} from "../shared/rpc/host";
import type { AgentHostConnectionRouterRPC } from "../shared/rpc/router";
import type { SessionRPC } from "../shared/rpc/session";
import { chatUri, parseChannel, requireName, sessionDOName, sessionUri } from "../shared/lookups";
import { AHPError } from "../shared/protocol";
import { callDoRpc } from "../shared/do-rpc";
import { HostDatabase } from "./db/database";
import { rootTable, type SessionEntry, sessionsTable } from "./db/schema";
import { count, eq } from "drizzle-orm";
import { EventsPublisher, type RootEvent, type RootEventWithRevision } from "./event-publisher";

// The getAgentInfo method makes callers return this, so we export the type
export type { AgentInfo } from "@microsoft/agent-host-protocol";

type ValidatedCreateSession = {
  params: AHPCreateSessionParams;
  provider: string;
  id: string;
  workingDirectory: string | undefined;
};

/**
 * Owns the session catalog and the root channel of one host.
 * Client connections reach the host through their `AgentHostConnectionRouter`.
 */
export abstract class AgentHost<
  Env = unknown,
  Router extends AgentHostConnectionRouterRPC = AgentHostConnectionRouterRPC,
  Session extends SessionRPC = SessionRPC,
>
  extends DurableObject<Env>
  implements HostRPC
{
  private db = new HostDatabase(this.ctx.storage);
  private durability = new DurabilityAlarms({
    context: this.ctx,
    handlers: {
      flushSubscribers: async (): Promise<void> => {
        await this.eventPublisher.flush(this.getRevision());
      },
    },
  });
  private eventPublisher = new EventsPublisher({
    db: this.db,
    router: (): DurableObjectNamespace<Router> => this.router,
    scheduleFlush: this.durability.flushSubscribers,
  });

  /**
   * Runs host database migrations before the Durable Object processes events. Then schedules
   * a check for routers that missed changes, because a restart loses the pushes in flight.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.db.migrate();
      await this.eventPublisher.recover(this.getRevision());
    });
  }

  /** The router Durable Object namespace. The host pushes root changes to the routers. */
  abstract router: DurableObjectNamespace<Router>;

  /** The session Durable Object namespace. The host creates and disposes sessions. */
  abstract session: DurableObjectNamespace<Session>;

  /**
   * Returns the agent metadata for the root snapshot and the provider used to create sessions.
   */
  protected abstract getAgentInfo(): AHPAgentInfo;

  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.durability.alarm(info);
  }

  async subscribeRoot(req: HostSubscribeRootRequest): Promise<HostSubscribeRootResponse> {
    try {
      const [revision, activeSessions] = this.db.transactionSync(() => {
        const currentRevision = this.getRevision();
        this.eventPublisher.subscribe(req.router, currentRevision);

        return [currentRevision, this.countActiveSessions()];
      });

      return {
        revision,
        state: {
          agents: [this.getAgentInfo()],
          activeSessions,
        },
      };
    } catch (error) {
      throw new HostSubscribeRootError(error);
    }
  }

  async unsubscribeRoot(req: HostUnsubscribeRootRequest): Promise<void> {
    this.eventPublisher.unsubscribe(req.router);
  }

  async listSessions(): Promise<AHPListSessionsResult> {
    // Poorly named part of the spec but this just returns summaries.
    try {
      const rows = this.db.orm.select({ summary: sessionsTable.summary }).from(sessionsTable).all();

      return { items: rows.map((row) => row.summary) };
    } catch (error) {
      throw new HostListSessionsError(error);
    }
  }

  async createSession(input: AHPCreateSessionParams): Promise<void> {
    try {
      const { params, provider, id, workingDirectory } = this.validateCreateSession(input);

      const hostId = this.hostName();
      const now = new Date().toISOString();
      const chatId = crypto.randomUUID();

      const newSession: SessionEntry = {
        id,
        revision: 0,
        defaultChat: chatUri(id, chatId),
        summary: {
          resource: params.channel,
          provider,
          title: "New session",
          status: AHPSessionStatus.Idle,
          createdAt: now,
          modifiedAt: now,
        },
      };

      const eventsWithRevisions = this.db.transactionSync(() => {
        this.db.orm.insert(sessionsTable).values(newSession).run();

        const events = [
          { kind: "sessionAdded", summary: newSession.summary },
          {
            kind: "action",
            action: {
              type: "root/activeSessionsChanged",
              activeSessions: this.countActiveSessions(),
            },
          },
        ] satisfies RootEvent[];

        return this.updateRevision(events);
      });

      await this.eventPublisher.publish(eventsWithRevisions);

      const doName = sessionDOName(hostId, id);
      await callDoRpc(
        () => this.session.getByName(doName),
        (session) =>
          session.create({
            hostId,
            sessionId: id,
            chatId,
            provider,
            createdAt: now,
            workingDirectory,
          }),
      ).catch(async (error) => {
        await this.removeSession(id).catch(() => null);
        throw error;
      });
    } catch (error) {
      throw new HostCreateSessionError(error);
    }
  }

  async disposeSession({ sessionId }: HostDisposeSessionRequest): Promise<void> {
    try {
      if (!this.getSession(sessionId)) {
        throw new AHPError("Session does not exist", AHPErrorCodes.SessionNotFound);
      }

      await this.removeSession(sessionId);
    } catch (error) {
      throw new HostDisposeSessionError(error);
    }
  }

  async summaryChanged(req: HostSummaryChangedRequest): Promise<void> {
    try {
      const update = HostSummaryChangedRequestSchema.parse(req);

      const eventsWithRevisions = this.db.transactionSync(() => {
        const entry = this.getSession(update.sessionId);
        if (
          !entry ||
          entry.defaultChat !== update.defaultChat ||
          update.revision <= entry.revision
        ) {
          return [];
        }

        this.db.orm
          .update(sessionsTable)
          .set({ summary: update.summary, revision: update.revision })
          .where(eq(sessionsTable.id, entry.id))
          .run();

        const changes = summaryChanges(entry.summary, update.summary);
        const session = sessionUri(update.sessionId);

        const events: RootEvent[] =
          Object.keys(changes).length > 0
            ? [{ kind: "sessionSummaryChanged", session, changes }]
            : [];

        return this.updateRevision(events);
      });

      await this.eventPublisher.publish(eventsWithRevisions);
    } catch (error) {
      throw new HostSummaryChangedError(error);
    }
  }

  private hostName(): string {
    return requireName(this.ctx, "AgentHost");
  }

  private getRevision(): number {
    return (
      this.db.orm.select({ revision: rootTable.revision }).from(rootTable).get()?.revision ?? 0
    );
  }

  private countActiveSessions(): number {
    return this.db.orm.select({ value: count() }).from(sessionsTable).get()?.value ?? 0;
  }

  private getSession(id: string): SessionEntry | undefined {
    return this.db.orm.select().from(sessionsTable).where(eq(sessionsTable.id, id)).get();
  }

  private async removeSession(id: string): Promise<void> {
    const hostId = this.hostName();
    const doName = sessionDOName(hostId, id);

    await callDoRpc(
      () => this.session.getByName(doName),
      (session) => session.dispose(),
    );

    const eventsWithRevisions = this.db.transactionSync(() => {
      const removed = this.db.orm
        .delete(sessionsTable)
        .where(eq(sessionsTable.id, id))
        .returning({ id: sessionsTable.id })
        .get();

      if (!removed) {
        return [];
      }

      const events = [
        { kind: "sessionRemoved", session: sessionUri(id) },
        {
          kind: "action",
          action: {
            type: "root/activeSessionsChanged",
            activeSessions: this.countActiveSessions(),
          },
        },
      ] satisfies RootEvent[];

      return this.updateRevision(events);
    });

    await this.eventPublisher.publish(eventsWithRevisions);
  }

  /**
   * Given new events, update root's current revision based on # of events.
   * Then, update each event's revision and return the mutated array.
   */
  private updateRevision(events: RootEvent[]): RootEventWithRevision[] {
    const first = this.getRevision() + 1;
    const newRevision = first + events.length - 1;

    if (events.length > 0) {
      this.db.orm
        .insert(rootTable)
        .values({ id: 1, revision: newRevision })
        .onConflictDoUpdate({ target: rootTable.id, set: { revision: newRevision } })
        .run();
    }

    return events.map((event, index) => ({ ...event, revision: first + index }));
  }

  private validateCreateSession(input: AHPCreateSessionParams): ValidatedCreateSession {
    const params = AHPCreateSessionParamsSchema.parse(input);
    const { provider } = this.getAgentInfo();
    const channel = parseChannel(params.channel);

    if (channel.kind !== "session") {
      throw new AHPError("Expected an ahp-session channel");
    }

    if (params.provider !== undefined && params.provider !== provider) {
      throw new AHPError("Agent provider does not exist", AHPErrorCodes.ProviderNotFound);
    }

    if (params.config || params.activeClient || (params.workingDirectories?.length ?? 0) > 1) {
      throw new AHPError(
        "Session configuration and multiple working directories are not supported",
      );
    }

    const directory = params.workingDirectories?.[0];
    const workingDirectory = directory === undefined ? undefined : localPath(directory);
    const id = channel.sessionId;

    if (this.getSession(id)) {
      throw new AHPError("Session already exists", AHPErrorCodes.SessionAlreadyExists);
    }

    return { params, provider, id, workingDirectory };
  }
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
    Object.entries(mutable).filter(([key, value]) => {
      const oldValue = before.get(key);

      if (oldValue === value) {
        return false;
      }

      // Deserialized JSON compares by reference, so equal objects read at different times look changed.
      if (oldValue instanceof Object && value instanceof Object) {
        return JSON.stringify(oldValue) !== JSON.stringify(value);
      }

      return true;
    }),
  );
}
