/* oxlint-disable import/max-dependencies -- beefy boi intentionally. */
import { DurableObject, waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { DurabilityAlarms } from "durability";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";
import {
  ActionType as AHPActionType,
  MessageKind as AHPMessageKind,
  ResponsePartKind as AHPResponsePartKind,
  SessionLifecycle as AHPSessionLifecycle,
} from "@microsoft/agent-host-protocol";
import type {
  ActionOrigin as AHPActionOrigin,
  ChatAction as AHPChatAction,
  ChatTurnStartedAction as AHPChatTurnStartedAction,
} from "@microsoft/agent-host-protocol";
import type {
  ChatTurnCancelledAction as TurnCancelledRequest,
  ChatTurnStartedAction as TurnStartedRequest,
} from "@experiments/protocol-schemas/ahp";
import {
  SessionCreateError,
  SessionDispatchError,
  SessionDisposeError,
  SessionSubscribeError,
} from "../shared/rpc/session";
import type {
  SessionRPC,
  SessionCreateRequest,
  SessionDispatchRequest,
  SessionSubscribeRequest,
  SessionSubscribeResponse,
  SessionUnsubscribeRequest,
} from "../shared/rpc/session";
import type { HostRPC } from "../shared/rpc/host";
import type { AgentHostConnectionRouterRPC, SessionUpdate } from "../shared/rpc/router";
import { toAHPError } from "../shared/rpc/errors";
import { errorMessage } from "../shared/errors";
import { chatUri, requireName, sessionIdFromDOName, sessionUri } from "../shared/lookups";
import { AHPError, sessionNotFound } from "../shared/protocol";
import { SessionDatabase } from "./db/database";
import { sessionTable } from "./db/schema";
import type { SessionRecord } from "./db/schema";
import { applyChat, applySession, buildSession, sessionSummary } from "./state";
import { AgentConnection } from "./agent-connection";
import { UpdatesPublisher } from "./update-publisher";

type SessionDurability = DurabilityAlarms<"syncCatalog" | "flushSubscribers">;

/**
 * The session has storage only between creation and removal. Without storage, reads return
 * nothing and writes do nothing. This prevents a request for an absent session from creating
 * storage. The `durability` helpers run their own migrations, so they exist only while the
 * storage is open.
 */
type StorageState =
  | { kind: "absent" }
  | { kind: "open"; durability: SessionDurability }
  | { kind: "removing"; removed: Promise<void> };

/** Changes the record in place and returns the update to push, or undefined to skip. */
type SessionChange = (record: SessionRecord) => SessionUpdate | undefined;

const CATALOG_SYNC_TIMEOUT_MS = 30_000;

/**
 * Owns one session: its persisted state, its ACP connection, and the routers that subscribe
 * to it. The session pushes its updates directly to those routers and syncs its summary to
 * the host catalog.
 */
export abstract class AgentSession<
  Env = unknown,
  Router extends AgentHostConnectionRouterRPC = AgentHostConnectionRouterRPC,
  Host extends HostRPC = HostRPC,
>
  extends DurableObject<Env>
  implements SessionRPC
{
  private db = new SessionDatabase(this.ctx.storage);
  private storage: StorageState = { kind: "absent" };
  private publisher: UpdatesPublisher<Router> = new UpdatesPublisher({
    db: this.db,
    router: (): DurableObjectNamespace<Router> => this.router,
    sessionId: (): string => this.sessionId(),
    scheduleFlush: async (time): Promise<void> => {
      await this.durability()?.flushSubscribers(time);
    },
  });
  private agent = new AgentConnection();
  // True for the whole prompt run of a turn.
  // The run can continue after a cancellation ends the active turn.
  private promptRunning = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.restoreAfterRestart();
    });
  }

  /** The router Durable Object namespace. The session pushes its updates to the routers. */
  abstract router: DurableObjectNamespace<Router>;

  /** The host Durable Object namespace. The session syncs its summary to the host. */
  abstract host: DurableObjectNamespace<Host>;

  protected abstract connectAgent(sessionId: string): Promise<ACPStream>;

  protected getWorkingDirectory(): string {
    return "/";
  }

  /** Runs due named alarms. A session without storage has none. */
  async alarm(info?: AlarmInvocationInfo): Promise<void> {
    await this.durability()?.alarm(info);
  }

  /**
   * Creates the session record and opens the agent connection. On failure, records a
   * creation error, removes the session, and rethrows.
   */
  async create(req: SessionCreateRequest): Promise<void> {
    try {
      const cwd = req.workingDirectory ?? this.getWorkingDirectory();

      if (!cwd.startsWith("/")) {
        throw new Error("Working directory must be an absolute path");
      }

      await this.insertSession(buildSession(req, cwd));
      const defaultChat = chatUri(req.sessionId, req.chatId);

      try {
        await this.openAgent();
        await this.applyExistingChange((record) =>
          applySession(record, { type: AHPActionType.SessionReady }),
        );
        // The first summary from the host does not have the working directories. This sync adds them.
        await this.durability()?.syncCatalog(Date.now());
      } catch (error) {
        await this.handleCreationFailed(error, defaultChat);
        throw error;
      }
    } catch (error) {
      throw new SessionCreateError(error);
    }
  }

  /**
   * Subscribes a router to a channel of this session and returns the channel snapshot.
   *
   * @throws {SessionSubscribeError} If the session does not exist or the channel does not
   * belong to it.
   */
  async subscribe(req: SessionSubscribeRequest): Promise<SessionSubscribeResponse> {
    try {
      return this.db.transactionSync(() => {
        const session = this.requireSession();
        const sessionChannel = sessionUri(session.id);

        if (req.channel !== sessionChannel && req.channel !== session.sessionState.defaultChat) {
          throw new AHPError("Channel does not belong to this session");
        }

        this.publisher.subscribe(req.router, req.channel, session.revision);

        return {
          revision: session.revision,
          state: req.channel === sessionChannel ? session.sessionState : session.chatState,
        };
      });
    } catch (error) {
      throw new SessionSubscribeError(error);
    }
  }

  /** Removes subscriptions of a router. Does nothing for an absent session. */
  async unsubscribe(req: SessionUnsubscribeRequest): Promise<void> {
    if (this.storage.kind === "open") {
      this.publisher.unsubscribe(req.router, req.channels);
    }
  }

  /** Routes a dispatched action to turn start or cancellation. */
  async dispatch({ channel, action, origin }: SessionDispatchRequest): Promise<void> {
    try {
      const session = this.requireSession();

      if (channel !== session.sessionState.defaultChat) {
        throw new Error("Channel does not belong to this session");
      }

      await (action.type === "chat/turnStarted"
        ? this.startTurn(action, origin)
        : this.cancelTurn(action, origin));
    } catch (error) {
      throw new SessionDispatchError(error);
    }
  }

  /** Removes the session and cancels and closes the agent connection. */
  async dispose(): Promise<void> {
    try {
      // `removeStorage` stops new changes before it waits.
      // This prevents the cancellation from adding a revision.
      // This method reports the first failure only after both steps finish.
      const results = await Promise.allSettled([this.removeStorage(), this.agent.cancel()]);
      const failure = results.find((result) => result.status === "rejected");

      if (failure) {
        throw toAHPError(failure.reason);
      }
    } catch (error) {
      throw new SessionDisposeError(error);
    } finally {
      this.agent.close();
    }
  }

  /**
   * Opens existing storage after a restart and records an error for any active turn. The
   * session does not store the agent connection. Thus a running turn cannot resume. Then
   * schedules a check for routers that missed updates, because a restart loses the pushes in
   * flight. Writes nothing if the session has no storage.
   *
   * TODO: support resuming turns
   */
  private async restoreAfterRestart(): Promise<void> {
    if (!this.db.hasMigrated()) {
      return;
    }

    await this.openStorage();

    await this.applyChange((record) => {
      const turn = record.chatState.activeTurn;

      return (
        turn &&
        applyChat(record, {
          type: AHPActionType.ChatError,
          turnId: turn.id,
          duration: 0,
          part: {
            kind: AHPResponsePartKind.Error,
            error: { errorType: "agent", message: "Turn interrupted by session restart" },
          },
        })
      );
    });

    const session = this.getSession();

    if (session) {
      await this.publisher.recover(session.revision);
    }
  }

  /** Creates or migrates the session tables and the named alarms. */
  private async openStorage(): Promise<void> {
    // The host can create a session ID again while `removeStorage` deletes the old storage.
    if (this.storage.kind === "removing") {
      await this.storage.removed;
    }

    if (this.storage.kind === "open") {
      return;
    }

    await this.db.migrate();

    const durability = new DurabilityAlarms({
      context: this.ctx,
      handlers: {
        syncCatalog: async (): Promise<void> => {
          await this.sendSummary();
        },
        flushSubscribers: async (): Promise<void> => {
          const session = this.getSession();

          if (session) {
            await this.publisher.flush(session.revision);
          }
        },
      },
      methods: {
        // The host ignores repeated summaries, so a timed-out sync can run again.
        syncCatalog: { attemptTimeoutMs: CATALOG_SYNC_TIMEOUT_MS, retryTimeouts: true },
      },
    });

    this.storage = { kind: "open", durability };
  }

  /**
   * Creates the storage and inserts a new record.
   *
   * @throws {Error} If a session exists.
   */
  private async insertSession(record: SessionRecord): Promise<void> {
    await this.openStorage();

    this.db.transactionSync(() => {
      if (this.db.orm.select({ id: sessionTable.id }).from(sessionTable).get()) {
        throw new Error("Session already exists");
      }

      this.db.orm.insert(sessionTable).values(record).run();
    });
  }

  /**
   * Closes the agent, records a creation-failed action, and removes the session. Does nothing
   * if the host removed the session and created it again.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- error comes from a catch binding
  private async handleCreationFailed(error: unknown, defaultChat: string): Promise<void> {
    if (!this.isCurrent(defaultChat)) {
      return;
    }

    this.agent.close();

    try {
      await this.applyChange((record) =>
        applySession(record, {
          type: AHPActionType.SessionCreationFailed,
          error: { errorType: "agent", message: errorMessage(error) },
        }),
      );
    } finally {
      await this.removeStorage();
    }
  }

  /**
   * Waits for the queued updates, tells the subscribed routers that the session is disposed,
   * then deletes all storage. `applyChange` writes nothing after this method starts.
   */
  private async removeStorage(): Promise<void> {
    if (this.storage.kind !== "open") {
      // Another call may be removing the storage now.
      if (this.storage.kind === "removing") {
        await this.storage.removed;
      }

      return;
    }

    const removed = (async (): Promise<void> => {
      await this.publisher.dispose();
      await this.db.deleteAll();
    })();

    this.storage = { kind: "removing", removed };

    try {
      await removed;
    } finally {
      this.storage = { kind: "absent" };
    }
  }

  /**
   * Opens the agent connection and stores the ACP session ID if the agent assigns a new one.
   */
  private async openAgent(): Promise<void> {
    const session = this.requireSession();
    const { defaultChat } = session.sessionState;

    const acpSessionId = await this.agent.open({
      stream: (): Promise<ACPStream> => this.connectAgent(session.id),
      cwd: session.cwd,
      sessionId: session.acpSessionId,
    });

    // The host can dispose the session while the agent connection opens.
    if (!this.isCurrent(defaultChat)) {
      throw sessionNotFound();
    }

    if (acpSessionId !== session.acpSessionId) {
      this.db.orm
        .update(sessionTable)
        .set({ acpSessionId })
        .where(eq(sessionTable.id, session.id))
        .run();
    }
  }

  /**
   * Validates a user text message, records the turn, and starts the prompt in the background.
   */
  private async startTurn(request: TurnStartedRequest, origin: AHPActionOrigin): Promise<void> {
    const { message } = request;

    if (
      message.origin.kind !== "user" ||
      (message.attachments?.length ?? 0) > 0 ||
      message.model ||
      message.agent
    ) {
      throw new Error("Only user text messages are supported");
    }

    const action: AHPChatTurnStartedAction = {
      type: AHPActionType.ChatTurnStarted,
      turnId: request.turnId,
      startedAt: request.startedAt,
      message: { text: message.text, origin: { kind: AHPMessageKind.User } },
    };

    if (this.promptRunning) {
      throw new Error("A turn is already running");
    }

    this.promptRunning = true;

    try {
      await this.applyExistingChange((record) => {
        if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
          throw new Error("Session is not ready");
        }

        if (record.chatState.activeTurn) {
          throw new Error("A turn is already running");
        }

        if (record.chatState.turns.some((turn) => turn.id === action.turnId)) {
          throw new Error("Turn ID already exists");
        }

        return applyChat(record, action, origin);
      });
    } catch (error) {
      this.promptRunning = false;
      throw error;
    }

    waitUntil(this.runPrompt(action));
  }

  /** Cancels the active turn and notifies the agent to stop the in-flight prompt. */
  private async cancelTurn(request: TurnCancelledRequest, origin: AHPActionOrigin): Promise<void> {
    await this.applyExistingChange((record) => {
      if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
        throw new Error("Session is not ready");
      }

      if (record.chatState.activeTurn?.id !== request.turnId) {
        throw new Error("No matching active turn to cancel");
      }

      return applyChat(record, { ...request, type: AHPActionType.ChatTurnCancelled }, origin);
    });

    await this.agent.cancel();
  }

  /**
   * Runs the agent prompt for a started turn and applies its response parts, completion, and
   * errors. Clears `promptRunning` when the prompt run ends.
   */
  private async runPrompt(action: AHPChatTurnStartedAction): Promise<void> {
    const { turnId } = action;
    const startedAt = Date.now();

    try {
      await this.openAgent();

      const responding = await this.applyActionToTurn(turnId, {
        type: AHPActionType.ChatResponsePart,
        turnId,
        part: { kind: AHPResponsePartKind.Markdown, id: turnId, content: "" },
      });

      if (!responding) {
        return;
      }

      const response = await this.agent.prompt(action.message.text, async (content) => {
        await this.applyActionToTurn(turnId, {
          type: AHPActionType.ChatDelta,
          turnId,
          partId: turnId,
          content,
        });
      });

      await this.applyActionToTurn(turnId, {
        type:
          response.stopReason === "cancelled"
            ? AHPActionType.ChatTurnCancelled
            : AHPActionType.ChatTurnComplete,
        turnId,
        duration: Date.now() - startedAt,
      });
    } catch (error) {
      await this.applyActionToTurn(turnId, {
        type: AHPActionType.ChatError,
        turnId,
        duration: Date.now() - startedAt,
        part: {
          kind: AHPResponsePartKind.Error,
          error: { errorType: "agent", message: errorMessage(error) },
        },
      });
    } finally {
      this.promptRunning = false;
    }
  }

  /** Returns the session record, or undefined if the session has no storage. */
  private getSession(): SessionRecord | undefined {
    return this.storage.kind === "open" ? this.db.orm.select().from(sessionTable).get() : undefined;
  }

  /**
   * Returns the session record.
   *
   * @throws {AHPError} If the session does not exist.
   */
  private requireSession(): SessionRecord {
    const session = this.getSession();

    if (!session) {
      throw sessionNotFound();
    }

    return session;
  }

  /**
   * Saves the changed record, then queues its update for the subscribed routers. Schedules a
   * catalog sync when a summary field other than `modifiedAt` changes.
   * Returns false when the session does not exist or the change is skipped.
   */
  private async applyChange(change: SessionChange): Promise<boolean> {
    const durability = this.durability();

    if (!durability) {
      return false;
    }

    const saved = this.db.transactionSync(() => {
      const session = this.getSession();

      if (!session) {
        return;
      }

      const before = catalogFields(session);
      const update = change(session);

      if (!update) {
        return;
      }

      this.db.orm.update(sessionTable).set(session).where(eq(sessionTable.id, session.id)).run();

      return { update, summaryChanged: before !== catalogFields(session) };
    });

    if (!saved) {
      return false;
    }

    await this.publisher.publish([saved.update]);

    if (saved.summaryChanged) {
      await durability.syncCatalog(Date.now());
    }

    return true;
  }

  /** Applies a change and pushes it. Throws when the session is absent. */
  private async applyExistingChange(
    change: (record: SessionRecord) => SessionUpdate,
  ): Promise<void> {
    const saved = await this.applyChange(change);

    if (!saved) {
      throw sessionNotFound();
    }
  }

  /**
   * Applies `action` while `turnId` is the active turn. Returns false after the turn stops being
   * active, for example after a cancellation.
   */
  private applyActionToTurn(turnId: string, action: AHPChatAction): Promise<boolean> {
    return this.applyChange((record) =>
      record.chatState.activeTurn?.id === turnId ? applyChat(record, action) : undefined,
    );
  }

  /**
   * Returns true if the stored session has the default chat `defaultChat`. Each creation makes
   * a new chat ID. Thus a session that the host removed and created again during an `await`
   * has a different `defaultChat`.
   */
  private isCurrent(defaultChat: string | undefined): boolean {
    return this.getSession()?.sessionState.defaultChat === defaultChat;
  }

  /** Sends the latest summary to the host. The host ignores old revisions. */
  private async sendSummary(): Promise<void> {
    const session = this.getSession();

    if (!session) {
      return;
    }

    await this.host.getByName(session.hostId).summaryChanged({
      sessionId: session.id,
      defaultChat: session.chatState.resource,
      revision: session.revision,
      summary: sessionSummary(session),
    });
  }

  /** Returns the named alarms while the session has storage. */
  private durability(): SessionDurability | undefined {
    return this.storage.kind === "open" ? this.storage.durability : undefined;
  }

  /** Returns the session ID from the Durable Object name. */
  private sessionId(): string {
    return sessionIdFromDOName(requireName(this.ctx, "AgentSession"));
  }
}

/**
 * Returns the summary fields that the host stores, without `modifiedAt`, as JSON. A change to
 * `modifiedAt` alone does not schedule a catalog sync.
 */
function catalogFields(record: SessionRecord): string {
  const { modifiedAt: _modifiedAt, ...fields } = sessionSummary(record);

  return JSON.stringify(fields);
}
