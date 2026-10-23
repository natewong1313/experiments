import { DurableObject } from "cloudflare:workers";
import { DurabilityAlarms } from "durability";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import type {
  ListSessionsResult as AHPListSessionsResult,
  SessionSummary as AHPSessionSummary,
} from "@experiments/protocol-schemas/ahp";
import {
  HostListSessionsError,
  HostSessionCreatedError,
  HostSessionEntrySchema,
  HostSessionRemovedError,
  HostSubscribeRootError,
  HostSummaryChangedError,
} from "../shared/rpc/host";
import type {
  HostRPC,
  HostOrphanRemovedRequest,
  HostRemovedResponse,
  HostSessionEntry,
  HostSessionRemovedRequest,
  HostSubscribeRootRequest,
  HostRouterClosedRequest,
  HostSubscribeRootResponse,
  HostUnsubscribeRootRequest,
} from "../shared/rpc/host";
import type { AgentHostConnectionRouterRPC, RootEvent, RootUpdate } from "../shared/rpc/router";
import { sessionUri } from "../shared/lookups";
import { sessionAlreadyExists } from "../shared/protocol";
import { HostDatabase } from "./db/database";
import { rootTable, type SessionEntry, sessionsTable } from "./db/schema";
import { and, count, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { EventsPublisher } from "./event-publisher";

// The getAgentInfo method makes callers return this, so we export the type
export type { AgentInfo } from "@microsoft/agent-host-protocol";

/**
 * Owns the session catalog and the root channel of one host.
 * Client connections reach the host through their `AgentHostConnectionRouter`.
 * Sessions add, update, and remove their own catalog entries. The host never calls a session.
 */
export abstract class AgentHostRoot<
  Env = unknown,
  Router extends AgentHostConnectionRouterRPC = AgentHostConnectionRouterRPC,
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
      checkSubscribers: async (): Promise<void> => {
        await this.eventPublisher.check(this.getRevision());
      },
    },
  });
  private eventPublisher = new EventsPublisher({
    db: this.db,
    router: (): DurableObjectNamespace<Router> => this.router,
    scheduleFlush: this.durability.flushSubscribers,
    scheduleCheck: this.durability.checkSubscribers,
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

  /** Returns the agent metadata for the root snapshot. */
  protected abstract getAgentInfo(): AHPAgentInfo | AHPAgentInfo[];

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

      await this.eventPublisher.scheduleCheck();

      return {
        revision,
        state: {
          agents: [this.getAgentInfo()].flat(),
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

  async routerClosed(req: HostRouterClosedRequest): Promise<void> {
    this.eventPublisher.close(req.router);
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

  async sessionCreated(req: HostSessionEntry): Promise<void> {
    try {
      const entry = HostSessionEntrySchema.parse(req);

      const eventsWithRevisions = this.db.transactionSync(() => {
        const existing = this.getSession(entry.sessionId);

        if (existing) {
          if (existing.defaultChat === entry.defaultChat) {
            return [];
          }

          throw sessionAlreadyExists();
        }

        this.db.orm
          .insert(sessionsTable)
          .values({
            id: entry.sessionId,
            defaultChat: entry.defaultChat,
            revision: entry.revision,
            summary: entry.summary,
          })
          .run();

        return this.updateRevision(
          this.membershipEvents({ kind: "sessionAdded", summary: entry.summary }),
        );
      });

      await this.eventPublisher.publish(eventsWithRevisions);
    } catch (error) {
      throw new HostSessionCreatedError(error);
    }
  }

  async summaryChanged(req: HostSessionEntry): Promise<void> {
    try {
      const update = HostSessionEntrySchema.parse(req);

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

  async sessionRemoved(req: HostSessionRemovedRequest): Promise<HostRemovedResponse> {
    const matches = and(
      eq(sessionsTable.id, req.sessionId),
      eq(sessionsTable.defaultChat, req.defaultChat),
    );

    return await this.removeEntry(req.sessionId, matches);
  }

  async orphanRemoved(req: HostOrphanRemovedRequest): Promise<HostRemovedResponse> {
    return await this.removeEntry(req.sessionId, eq(sessionsTable.id, req.sessionId));
  }

  /** Removes the entry that `matches` selects and tells root subscribers. */
  private async removeEntry(
    sessionId: string,
    matches: SQL | undefined,
  ): Promise<HostRemovedResponse> {
    try {
      const eventsWithRevisions = this.db.transactionSync(() => {
        const removed = this.db.orm
          .delete(sessionsTable)
          .where(matches)
          .returning({ id: sessionsTable.id })
          .get();

        if (!removed) {
          return [];
        }

        const event = { kind: "sessionRemoved", session: sessionUri(sessionId) } as const;

        return this.updateRevision(this.membershipEvents(event));
      });

      await this.eventPublisher.publish(eventsWithRevisions);

      return { removed: eventsWithRevisions.length > 0 };
    } catch (error) {
      throw new HostSessionRemovedError(error);
    }
  }

  /** Returns a catalogue membership event and the new count of active sessions. */
  private membershipEvents(event: RootEvent): RootEvent[] {
    return [
      event,
      {
        kind: "action",
        action: { type: "root/activeSessionsChanged", activeSessions: this.countActiveSessions() },
      },
    ];
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

  /**
   * Given new events, update root's current revision based on # of events.
   * Then, update each event's revision and return the mutated array.
   */
  private updateRevision(events: RootEvent[]): RootUpdate[] {
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
