/* oxlint-disable import/max-dependencies -- The session owns its record, its agent connection, its subscribers, and its catalog entry. */
import { DurableObject, waitUntil } from "cloudflare:workers";
import { RequestError as ACPRequestError } from "@agentclientprotocol/sdk";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";
import {
  ActionType as AHPActionType,
  AhpErrorCodes as AHPErrorCodes,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
} from "@microsoft/agent-host-protocol";
import type {
  AgentInfo as AHPAgentInfo,
  SessionModelInfo as AHPSessionModelInfo,
} from "@microsoft/agent-host-protocol";
import {
  SessionCreateError,
  SessionDispatchError,
  SessionDisposeError,
  SessionFetchTurnsError,
  SessionSubscribeError,
} from "../shared/rpc/session";
import type {
  SessionRPC,
  SessionCreateRequest,
  SessionDispatchRequest,
  SessionFetchTurnsRequest,
  SessionRouterClosedRequest,
  SessionSubscribeRequest,
  SessionSubscribeResponse,
  SessionUnsubscribeRequest,
} from "../shared/rpc/session";
import type { HostRPC } from "../shared/rpc/host";
import type { AgentHostConnectionRouterRPC, SessionUpdate } from "../shared/rpc/router";
import { toAHPError } from "../shared/rpc/errors";
import type { StubFor } from "../shared/stubs";
import { errorMessage } from "../shared/errors";
import { parseSessionDOName, requireName, sessionUri } from "../shared/lookups";
import type { SessionDOName } from "../shared/lookups";
import { AHPError, chatNotFound, sessionAlreadyExists, sessionNotFound } from "../shared/protocol";
import { SingleFlight } from "../shared/single-flight";
import { SessionDatabase } from "./db/database";
import { durabilityAlarmScheduler } from "./alarm-scheduler";
import type {
  SessionAlarmInfo,
  SessionAlarmScheduler,
  SessionAlarmSchedulerOptions,
} from "./alarm-scheduler";
import type { SessionRecord } from "./db/schema";
import { applyLoaded, applySession, buildSession } from "./state";
import { AgentConnection } from "./agent-connection";
import { UpdatesPublisher } from "./update-publisher";
import { validateCreateRequest } from "./create-request";
import type { CreateTarget } from "./create-request";
import { HostCatalog } from "./host-catalog";
import { DEFAULT_LIFECYCLE_POLICY, retryDelay } from "./lifecycle-policy";
import type { SessionLifecyclePolicy } from "./lifecycle-policy";
import type { ActiveTurnText } from "./chat/store";
import { defaultChatOf, phaseOf } from "./records";
import type { ApplyOutcome, SessionChange } from "./records";
import { SessionStorage } from "./storage";
import { SessionTurns } from "./turns";

export type { SessionLifecyclePolicy } from "./lifecycle-policy";

export type {
  SessionAlarmHandler,
  SessionAlarmInfo,
  SessionAlarmName,
  SessionAlarmPolicy,
  SessionAlarmScheduler,
  SessionAlarmSchedulerOptions,
} from "./alarm-scheduler";

/**
 * Owns one session: its persisted state, its ACP connection, and the routers that subscribe
 * to it. The session pushes its updates directly to those routers.
 *
 * The session also owns its entry in the host catalog. It calls `sessionCreated` before the
 * agent connection opens, `summaryChanged` when the summary changes, and `sessionRemoved`
 * before it deletes its storage.
 *
 * A dispose commits when the session marks its record as disposing. From then on, the session
 * rejects requests, and the only next step is deletion.
 */
export abstract class AgentHostSession<
  Env = unknown,
  Router extends AgentHostConnectionRouterRPC = AgentHostConnectionRouterRPC,
  Host extends HostRPC = HostRPC,
>
  extends DurableObject<Env>
  implements SessionRPC
{
  private db = new SessionDatabase(this.ctx.storage);
  private storage = new SessionStorage({
    db: this.db,
    scheduler: (options): SessionAlarmScheduler => this.createAlarmScheduler(options),
    policy: (): SessionLifecyclePolicy => this.getLifecyclePolicy(),
    hasSubscribers: (chat): boolean => this.publisher.hasSubscribers(chat),
    handlers: {
      syncCatalog: async (): Promise<void> => {
        await this.sendSummary();
      },
      flushSubscribers: async (): Promise<void> => {
        const session = this.storage.session();

        if (session) {
          await this.publisher.flush(session.revision);
        }
      },
      checkSubscribers: async (): Promise<void> => {
        const session = this.storage.session();

        if (session) {
          await this.publisher.check(session.revision);
        }
      },
      finishCreate: async (info: SessionAlarmInfo): Promise<void> => {
        await this.finishCreate(info);
      },
      finishDispose: (): void => {
        // The disposal deletes all storage, which includes the table of the named alarms.
        // It runs after this handler returns, so the scheduler records the run first.
        // The disposal schedules a new run if it fails.
        waitUntil(this.retryDisposal());
      },
      continueTurn: async (): Promise<void> => {
        await this.turns.continue();
      },
    },
  });
  private publisher: UpdatesPublisher<Router> = new UpdatesPublisher({
    db: this.db,
    router: (): DurableObjectNamespace<Router> => this.router,
    sessionId: (): string => this.name().sessionId,
    scheduleFlush: async (time): Promise<void> => {
      await this.storage.alarms()?.schedule("flushSubscribers", time);
    },
    scheduleCheck: async (time): Promise<void> => {
      await this.storage.alarms()?.schedule("checkSubscribers", time);
    },
  });
  private catalog = new HostCatalog((): StubFor<"host"> => this.host.getByName(this.name().hostId));
  private agent = new AgentConnection();
  private turns = new SessionTurns({
    agent: this.agent,
    openAgent: async (): Promise<void> => {
      await this.openAgent();
    },
    applyChange: async (change): Promise<ApplyOutcome> => await this.applyChange(change),
    activeTurn: (): ActiveTurnText | undefined => {
      const session = this.storage.session();

      return session && this.storage.records.chats.activeTurn(defaultChatOf(session));
    },
    scheduleContinue: async (time): Promise<void> => {
      await this.storage.alarms()?.schedule("continueTurn", time);
    },
    policy: (): SessionLifecyclePolicy => this.storage.requireOpen().policy,
    models: (): readonly AHPSessionModelInfo[] =>
      this.getAgentInfo(this.storage.requireSession().sessionState.provider).models,
  });
  // The creation and the disposal that run now, keyed by default chat.
  // Callers for the same creation wait for them.
  private creation = new SingleFlight();
  private disposal = new SingleFlight();
  // Failed disposal runs since the last success. They set the next `finishDispose` delay.
  private disposalFailures = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.restoreAfterRestart();
    });
  }

  /** The router Durable Object namespace. The session pushes its updates to the routers. */
  abstract router: DurableObjectNamespace<Router>;

  /** The host Durable Object namespace. The session keeps its catalog entry at the host. */
  abstract host: DurableObjectNamespace<Host>;

  protected abstract connectAgent(sessionId: string, provider: string): Promise<ACPStream>;

  /** Returns provider metadata. An omitted provider selects the default backend. */
  protected abstract getAgentInfo(provider?: string): AHPAgentInfo;

  protected getWorkingDirectory(): string {
    return "/";
  }

  /**
   * Returns the scheduler of the named alarms. The default keeps them in `durability` tables
   * and owns the Durable Object alarm. Override it to share the alarm with other code, such as
   * a Lifecycle that runs an agent harness in this object. The storage calls it each time it
   * opens, so it can run before the constructor of a subclass returns.
   */
  protected createAlarmScheduler(options: SessionAlarmSchedulerOptions): SessionAlarmScheduler {
    return durabilityAlarmScheduler(this.ctx, options);
  }

  /** Returns the timing of the creation and dispose alarms. The storage reads it when it opens. */
  protected getLifecyclePolicy(): SessionLifecyclePolicy {
    return DEFAULT_LIFECYCLE_POLICY;
  }

  /** Runs due named alarms. A session without storage has none. */
  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.storage.alarms()?.alarm(info);
  }

  async create(req: SessionCreateRequest): Promise<void> {
    try {
      const target = validateCreateRequest(req, {
        sessionId: this.name().sessionId,
        provider: this.getAgentInfo(req.provider).provider,
        defaultCwd: this.getWorkingDirectory(),
      });

      const session = await this.findOrInsertSession(target);

      if (phaseOf(session) === "ready") {
        return;
      }

      try {
        await this.runCreation(defaultChatOf(session));
      } catch (error) {
        // A failed creation can commit a dispose. Then the caller gets the error after deletion.
        // If the deletion fails, the `finishDispose` alarm deletes the storage later.
        await this.completeDisposal().catch(logFailure("Session deletion failed"));

        // An error that is not an AHP error is transient, and `finishCreate` continues.
        throw toAHPError(error, AHPJsonRpcErrorCodes.InternalError);
      }
    } catch (error) {
      throw new SessionCreateError(error);
    }
  }

  /**
   * Subscribes a router to a channel of this session and returns the channel snapshot. A chat
   * subscription can widen the loaded history of the chat. The other subscribers then receive
   * the added turns.
   *
   * @throws {SessionSubscribeError} With the `SessionNotFound` code if the session does not
   * exist, or with the `NotFound` code if the channel does not belong to it.
   */
  async subscribe(req: SessionSubscribeRequest): Promise<SessionSubscribeResponse> {
    try {
      const { snapshot, widened } = this.db.transactionSync(() => {
        const session = this.storage.requireSession();
        const isChat = req.channel !== sessionUri(session.id);

        if (isChat && req.channel !== defaultChatOf(session)) {
          throw chatNotFound();
        }

        // The first chat subscriber starts a window without publishing an action or advancing the revision.
        // Widening an existing window publishes the added turns to the other subscribers.
        const { records } = this.storage;
        const loaded = isChat ? records.chats.openWindow(req.channel, req.view?.turns) : undefined;
        const saved = loaded && records.save((record) => applyLoaded(record, loaded));

        const record = this.storage.requireSession();
        this.publisher.subscribe(req.router, req.channel, record.revision);

        return {
          snapshot: {
            revision: record.revision,
            state: this.storage.records.channelState(record, req.channel),
          },
          widened: saved?.status === "applied" ? saved.update : undefined,
        };
      });

      if (widened) {
        await this.publisher.publish([widened]);
      }

      await this.publisher.scheduleCheck();

      return snapshot;
    } catch (error) {
      throw new SessionSubscribeError(error);
    }
  }

  /**
   * Loads the next page of older turns into the loaded history of the chat.
   * AHP requires the call to resolve after the requesting router receives `chat/turnsLoaded`.
   *
   * @throws {SessionFetchTurnsError} If the session does not exist, the channel does not belong
   * to it, or the cursor is unknown.
   */
  async fetchTurns(req: SessionFetchTurnsRequest): Promise<void> {
    try {
      if (req.channel !== defaultChatOf(this.storage.requireSession())) {
        throw chatNotFound();
      }

      // The loaded turns go only to subscribers, so the router must subscribe first.
      if (!this.publisher.isSubscribed(req.router, req.channel)) {
        throw new AHPError("Subscribe to the chat before fetching turns");
      }

      const outcome = await this.applyChange((record, chats) => {
        const loaded = chats.fetchTurns(req.channel, req.cursor);

        return loaded && applyLoaded(record, loaded);
      });

      if (outcome === "absent") {
        throw sessionNotFound();
      }

      // A retry of a used cursor loads nothing, but an earlier load can still be in flight.
      const { revision } = this.storage.requireSession();

      if (!(await this.publisher.delivered(req.router, revision))) {
        throw new AHPError(
          "The connection did not receive the loaded turns",
          AHPJsonRpcErrorCodes.InternalError,
        );
      }
    } catch (error) {
      throw new SessionFetchTurnsError(error);
    }
  }

  /** Removes subscriptions of a router. Does nothing for an absent session. */
  async unsubscribe(req: SessionUnsubscribeRequest): Promise<void> {
    if (this.storage.isOpen()) {
      this.publisher.unsubscribe(req.router, req.channels);
    }
  }

  /**
   * Removes the subscriptions of a closed router and rejects its later subscribe requests. Does
   * nothing for an absent session, which accepts no subscribe requests.
   */
  async routerClosed(req: SessionRouterClosedRequest): Promise<void> {
    if (this.storage.isOpen()) {
      this.publisher.close(req.router);
    }
  }

  /** Routes a dispatched action to turn start or cancellation. */
  async dispatch({ channel, action, origin }: SessionDispatchRequest): Promise<void> {
    try {
      const session = this.storage.requireSession();

      if (channel !== defaultChatOf(session)) {
        throw chatNotFound();
      }

      await (action.type === "chat/turnStarted"
        ? this.turns.start(action, origin)
        : this.turns.cancel(action, origin));
    } catch (error) {
      throw new SessionDispatchError(error);
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.storage.settled();
      const record = this.storage.record();

      if (!record) {
        await this.removeOrphanedEntry();

        return;
      }

      const { policy } = this.storage.requireOpen();
      const defaultChat = defaultChatOf(record);
      await this.commitDispose(defaultChat, Date.now() + policy.disposeFallbackMs);

      // A create can finish the disposal while the dispose commits.
      // The connection that the create opens belongs to the new creation.
      if (this.isDisposing(defaultChat)) {
        await this.agent.stop();
      }

      await this.completeDisposal();
    } catch (error) {
      throw new SessionDisposeError(toAHPError(error, AHPJsonRpcErrorCodes.InternalError));
    }
  }

  /**
   * Opens existing storage after a restart and schedules the alarm that continues the phase
   * it finds. The session does not store the agent connection, so an active turn continues in
   * the `continueTurn` alarm, which reattaches to the prompt of the turn. Writes nothing if the
   * session has no storage. This method runs in `blockConcurrencyWhile`, so it does not call
   * the host or the agent.
   */
  private async restoreAfterRestart(): Promise<void> {
    if (!this.storage.hasTables()) {
      return;
    }

    await this.storage.open();
    const { alarms } = this.storage.requireOpen();

    switch (phaseOf(this.storage.record())) {
      case "absent": {
        // A create stopped after it scheduled its alarm and before it inserted the record.
        await this.storage.remove();

        return;
      }

      case "disposing": {
        await alarms.schedule("finishDispose", Date.now());

        return;
      }

      case "creating": {
        await alarms.schedule("finishCreate", Date.now());
        break;
      }

      case "ready": {
        break;
      }
    }

    const session = this.storage.requireSession();

    if (this.storage.records.chats.activeTurnId(defaultChatOf(session)) !== undefined) {
      await alarms.schedule("continueTurn", Date.now());
    }

    if (session.revision > session.syncedRevision) {
      await alarms.schedule("syncCatalog", Date.now());
    }

    await this.publisher.recover(session.revision);
  }

  /**
   * Returns the stored session for a create request, and inserts a new session if none is
   * stored. Finishes the deletion of a disposing session first.
   *
   * @throws {AHPError} If the stored session has a different provider or working directory, or
   * if a disposing session cannot finish its deletion.
   */
  private async findOrInsertSession(target: CreateTarget): Promise<SessionRecord> {
    await this.storage.open();

    if (phaseOf(this.storage.record()) === "disposing") {
      try {
        await this.completeDisposal();
      } catch {
        throw sessionAlreadyExists();
      }

      await this.storage.open();
    }

    if (!this.storage.record()) {
      // The session schedules the alarm before the record. An alarm without a record does nothing.
      // A record without an alarm cannot finish after a restart.
      const { alarms, policy } = this.storage.requireOpen();
      await alarms.schedule("finishCreate", Date.now() + policy.createDeadlineMs);
    }

    const session = this.storage.records.insertIfAbsent(() =>
      buildSession({
        ...target,
        sessionId: this.name().sessionId,
        chatId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      }),
    );

    if (
      phaseOf(session) === "disposing" ||
      session.sessionState.provider !== target.provider ||
      session.cwd !== target.cwd
    ) {
      throw sessionAlreadyExists();
    }

    return session;
  }

  /** Runs the steps of the creation with `defaultChat`, or waits for the steps that run now. */
  private async runCreation(defaultChat: string): Promise<void> {
    await this.creation.run(defaultChat, async () => {
      await this.creationSteps(defaultChat);
    });
  }

  /**
   * Adds the session to the host catalog, opens the agent connection, and marks the session
   * ready. Each step can run again after a failure. A permanent failure commits a dispose.
   *
   * @throws {AHPError} With the `SessionNotFound` code if a dispose starts during the steps.
   */
  private async creationSteps(defaultChat: string): Promise<void> {
    const session = this.storage.session();

    if (!session || defaultChatOf(session) !== defaultChat) {
      throw sessionNotFound();
    }

    if (phaseOf(session) !== "creating") {
      return;
    }

    try {
      await this.catalog.created(this.storage.records.catalogEntry(session));
      this.storage.records.markSynced(defaultChat, session.revision);
      await this.openAgent();

      await this.applyChange((record) =>
        phaseOf(record) === "creating"
          ? applySession(record, { type: AHPActionType.SessionReady })
          : undefined,
      );
    } catch (error) {
      if (!this.isCurrent(defaultChat)) {
        throw sessionNotFound();
      }

      if (isPermanentCreationFailure(error)) {
        await this.failCreation(defaultChat, error);
      }

      throw error;
    }
  }

  /**
   * Runs the `finishCreate` alarm. Continues a creation that a restart or a transient error
   * stopped. A timeout closes the agent connection, which stops the attempt. The record counts
   * the attempts, so a restart does not reset them. After the last attempt, fails the creation.
   */
  private async finishCreate({ signal }: SessionAlarmInfo): Promise<void> {
    const session = this.storage.session();

    if (!session || phaseOf(session) !== "creating") {
      return;
    }

    const defaultChat = defaultChatOf(session);
    const attempts = this.storage.records.countCreationAttempt(defaultChat);

    const stop = (): void => {
      this.agent.close();
    };

    signal.addEventListener("abort", stop);

    try {
      await this.runCreation(defaultChat);
    } catch (error) {
      // No creation remains to retry if the attempt failed it or a dispose started.
      if (!this.isCurrent(defaultChat)) {
        return;
      }

      if (attempts < this.storage.requireOpen().policy.createAttempts) {
        throw error;
      }

      await this.failCreation(defaultChat, error);
    } finally {
      signal.removeEventListener("abort", stop);
    }
  }

  /**
   * Closes the agent connection, records a creation-failed action, and commits a dispose. The
   * `finishDispose` alarm deletes the session.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- error comes from a catch binding
  private async failCreation(defaultChat: string, error: unknown): Promise<void> {
    this.agent.close();

    await this.commitDispose(defaultChat, Date.now(), (record) =>
      applySession(record, {
        type: AHPActionType.SessionCreationFailed,
        error: { errorType: "agent", message: errorMessage(error) },
      }),
    );
  }

  /**
   * Commits a dispose of the creation with `defaultChat`, with the optional final `change`.
   * Schedules `finishDispose` at `at` first, so the dispose finishes after a restart. An alarm
   * without a disposing record does nothing.
   */
  private async commitDispose(
    defaultChat: string,
    at: number,
    change?: (record: SessionRecord) => SessionUpdate,
  ): Promise<void> {
    await this.storage.requireOpen().alarms.schedule("finishDispose", at);
    const committed = this.storage.records.commitDispose(defaultChat, change);

    if (committed?.update) {
      await this.publisher.publish([committed.update]);
    }
  }

  /**
   * Closes the agent connection, tells the subscribed routers, removes the catalog entry, and
   * then deletes all storage. Does nothing unless a dispose committed. Callers for the same
   * creation wait for the steps that run now. Each step can run again after a failure.
   *
   * The `finishDispose` alarm and a create can run these steps while `dispose` still waits for
   * the agent. A connection that stays open after the deletion goes to the next creation.
   */
  private async completeDisposal(): Promise<void> {
    const record = this.storage.record();

    if (!record || phaseOf(record) !== "disposing") {
      return;
    }

    await this.disposal.run(defaultChatOf(record), async () => {
      this.agent.close();
      await this.publisher.dispose();
      await this.catalog.removed(record.id, defaultChatOf(record));
      await this.storage.remove();
    });
  }

  /** Runs the disposal for the `finishDispose` alarm, and schedules a new run if it fails. */
  private async retryDisposal(): Promise<void> {
    try {
      await this.completeDisposal();
      this.disposalFailures = 0;
    } catch (error) {
      logFailure("Session deletion failed")(error);
      this.disposalFailures += 1;
      const open = this.storage.opened();

      if (open) {
        const delay = retryDelay(open.policy, this.disposalFailures);
        await open.alarms.schedule("finishDispose", Date.now() + delay);
      }
    }
  }

  /**
   * Removes a catalog entry with the session ID of this object, which has no session.
   *
   * @throws {AHPError} With the `SessionNotFound` code if the catalog has no entry.
   */
  private async removeOrphanedEntry(): Promise<void> {
    if (!(await this.catalog.orphanRemoved(this.name().sessionId))) {
      throw sessionNotFound();
    }
  }

  /**
   * Opens the agent connection and stores the ACP session ID if the agent assigns a new one.
   */
  private async openAgent(): Promise<void> {
    const session = this.storage.requireSession();
    const defaultChat = defaultChatOf(session);

    const acpSessionId = await this.agent.open({
      stream: (): Promise<ACPStream> =>
        this.connectAgent(session.id, session.sessionState.provider),
      cwd: session.cwd,
      sessionId: session.acpSessionId,
      models: this.getAgentInfo(session.sessionState.provider).models.map((model) => model.id),
    });

    // A dispose can start while the agent connection opens.
    if (!this.isCurrent(defaultChat)) {
      throw sessionNotFound();
    }

    if (acpSessionId !== session.acpSessionId) {
      this.storage.records.setAcpSessionId(defaultChat, acpSessionId);
    }
  }

  /**
   * Saves the changed record, then queues its update for the subscribed routers. Schedules a
   * catalog sync when a summary field other than `modifiedAt` changes. Returns `absent` when
   * the session is absent or disposing, `skipped` when the change does nothing, and `applied`
   * when it saved a change.
   */
  private async applyChange(change: SessionChange): Promise<ApplyOutcome> {
    const alarms = this.storage.alarms();

    if (!alarms) {
      return "absent";
    }

    const saved = this.storage.records.save(change);

    if (saved.status !== "applied") {
      return saved.status;
    }

    await this.publisher.publish([saved.update]);

    if (saved.summaryChanged) {
      await alarms.schedule("syncCatalog", Date.now());
    }

    return "applied";
  }

  /**
   * Returns true if the creation with `defaultChat` is stored and not disposing. A session
   * that was disposed and created again during an `await` has a different default chat.
   */
  private isCurrent(defaultChat: string): boolean {
    const session = this.storage.session();

    return session !== undefined && defaultChatOf(session) === defaultChat;
  }

  /** Returns true if the creation with `defaultChat` committed a dispose and is stored. */
  private isDisposing(defaultChat: string): boolean {
    const record = this.storage.record();

    return (
      record !== undefined &&
      phaseOf(record) === "disposing" &&
      defaultChatOf(record) === defaultChat
    );
  }

  /**
   * Sends the latest summary to the host. Until the session is ready, `sessionCreated` carries
   * the summary, so this method sends nothing.
   */
  private async sendSummary(): Promise<void> {
    const session = this.storage.session();

    if (!session || phaseOf(session) !== "ready") {
      return;
    }

    await this.catalog.summaryChanged(this.storage.records.catalogEntry(session));
    this.storage.records.markSynced(defaultChatOf(session), session.revision);
  }

  /** Returns the host ID and session ID from the Durable Object name. */
  private name(): SessionDOName {
    return parseSessionDOName(requireName(this.ctx, "AgentHostSession"));
  }
}

/**
 * Returns true if a creation cannot succeed when it runs again: the agent answered with an
 * error, or the host catalog has another session with the session ID.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- error comes from a catch binding
function isPermanentCreationFailure(error: unknown): boolean {
  return (
    error instanceof ACPRequestError ||
    toAHPError(error).code === AHPErrorCodes.SessionAlreadyExists
  );
}

/** Returns a handler that logs a failure that no caller receives. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- error comes from a catch binding
function logFailure(message: string): (error: unknown) => void {
  return (error) => {
    console.error(message, { error: errorMessage(error) });
  };
}
