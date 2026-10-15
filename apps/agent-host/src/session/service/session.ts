import { waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";
import {
  ActionType as AHPActionType,
  ResponsePartKind as AHPResponsePartKind,
  SessionLifecycle as AHPSessionLifecycle,
  MessageKind as AHPMessageKind,
} from "@microsoft/agent-host-protocol";
import type {
  ActionOrigin as AHPActionOrigin,
  ChatAction as AHPChatAction,
  ChatTurnStartedAction as AHPChatTurnStartedAction,
} from "@microsoft/agent-host-protocol";
import type {
  ChatTurnStartedAction as TurnStartedRequest,
  ChatTurnCancelledAction as TurnCancelledRequest,
} from "@experiments/protocol-schemas/ahp";
import { errorMessage } from "../../shared/errors";
import type {
  SessionCreateRequest,
  SessionDispatchRequest,
  SessionSnapshotRequest,
  SessionSnapshotResponse,
} from "../../shared/rpc/session";
import type { HostRPC, HostSessionUpdateRequest } from "../../shared/rpc/host";
import { chatUri, sessionUri } from "../../shared/lookups";
import type { SessionDatabase } from "../db/database";
import { sessionTable } from "../db/schema";
import type { SessionRecord } from "../db/schema";
import { applyChat, applySession, buildSession } from "../state";
import { AgentConnection } from "./agent";
import { HostUpdatesService } from "./host-updates";
import type { SessionChange } from "./host-updates";

type SessionServiceCallbacks = {
  workingDirectory(): string;
  hostNamespace(): DurableObjectNamespace<HostRPC>;
  connectAgent(sessionId: string): Promise<ACPStream>;
};

/**
 * Owns the single session record stored by this Durable Object and drives its chat turns
 * against the connected agent.
 */
export class SessionService {
  // Covers a turn's whole prompt run, which can outlast the active turn after cancellation.
  private promptRunning = false;
  private agent = new AgentConnection();
  private db: SessionDatabase;
  private callbacks: SessionServiceCallbacks;
  private hostUpdates: HostUpdatesService;

  constructor(db: SessionDatabase, callbacks: SessionServiceCallbacks) {
    this.db = db;
    this.callbacks = callbacks;
    this.hostUpdates = new HostUpdatesService(db, async (hostId, update): Promise<void> => {
      await callbacks.hostNamespace().getByName(hostId).sessionUpdate(update);
    });
  }

  /**
   * Errors any active turn when the Durable Object restarts. The agent connection is not
   * persisted, so we don't allow running turns to resume.
   *
   * TODO: support this
   */
  async load(): Promise<void> {
    await this.hostUpdates.save((record) => {
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
  }

  /** Delivers due host updates after an alarm fires. */
  async onAlarm(): Promise<void> {
    await this.hostUpdates.onAlarm();
  }

  /** Resumes host-update delivery after a permanent failure has been repaired. */
  async retryHostUpdates(): Promise<void> {
    await this.hostUpdates.resumeAfterFailure();
  }

  /**
   * Creates the session record and opens the agent connection. On failure, records a
   * creation error, removes the record, and rethrows.
   */
  async create(options: SessionCreateRequest): Promise<void> {
    const cwd = options.workingDirectory ?? this.callbacks.workingDirectory();

    if (!cwd.startsWith("/")) {
      throw new Error("Working directory must be an absolute path");
    }

    await this.db.transaction(async () => {
      if (this.db.orm.select({ id: sessionTable.id }).from(sessionTable).get()) {
        throw new Error("Session already exists");
      }

      this.db.orm.insert(sessionTable).values(buildSession(options, cwd)).run();
    });

    try {
      await this.openAgent();
      await this.applyExisting((record) =>
        applySession(record, { type: AHPActionType.SessionReady }),
      );
    } catch (error) {
      await this.handleCreationFailed(error, chatUri(options.chatId));
      throw error;
    }
  }

  /**
   * Closes the agent, records a creation-failed action, and removes the session record for the
   * generation identified by `chat`.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- error comes from a catch binding
  private async handleCreationFailed(error: unknown, chat: string): Promise<void> {
    const current = this.db.orm
      .select({ sessionState: sessionTable.sessionState })
      .from(sessionTable)
      .get();

    if (!isCurrentGeneration(current?.sessionState.defaultChat, chat)) {
      return;
    }

    this.agent.close();

    try {
      await this.apply((record) => {
        if (!isCurrentGeneration(record.sessionState.defaultChat, chat)) {
          return;
        }

        return applySession(record, {
          type: AHPActionType.SessionCreationFailed,
          error: { errorType: "agent", message: errorMessage(error) },
        });
      });
    } finally {
      await this.removeRecord(chat);
    }
  }

  /**
   * Returns the revision and state of a channel that belongs to this session.
   *
   * @throws {Error} If the session does not exist or the channel is foreign to it.
   */
  async snapshot(req: SessionSnapshotRequest): Promise<SessionSnapshotResponse> {
    const record = this.db.orm
      .select({
        id: sessionTable.id,
        sessionState: sessionTable.sessionState,
        chatState: sessionTable.chatState,
        revision: sessionTable.revision,
      })
      .from(sessionTable)
      .get();

    if (!record) {
      throw new Error("Session does not exist");
    }

    const sessionChannel = sessionUri(record.id);

    if (req.channel !== sessionChannel && req.channel !== record.sessionState.defaultChat) {
      throw new Error("Channel does not belong to this session");
    }

    return {
      revision: record.revision,
      state: req.channel === sessionChannel ? record.sessionState : record.chatState,
    };
  }

  /** Routes a dispatched action to turn start or cancellation. */
  async dispatch({ action, origin }: SessionDispatchRequest): Promise<void> {
    await (action.type === "chat/turnStarted"
      ? this.startTurn(action, origin)
      : this.cancelTurn(action, origin));
  }

  /** Removes the session record and cancels and closes the agent connection. */
  async dispose(): Promise<void> {
    try {
      await this.removeRecord();
      await this.agent.cancel();
    } finally {
      this.agent.close();
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
      await this.applyExisting((record) => {
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
    await this.applyExisting((record) => {
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
   * Opens the agent connection and persists the agent session id when a new one is assigned.
   */
  private async openAgent(): Promise<void> {
    const record = this.db.orm
      .select({
        id: sessionTable.id,
        cwd: sessionTable.cwd,
        acpSessionId: sessionTable.acpSessionId,
      })
      .from(sessionTable)
      .get();

    if (!record) {
      throw new Error("Session does not exist");
    }

    const acpSessionId = await this.agent.open({
      stream: (): Promise<ACPStream> => this.callbacks.connectAgent(record.id),
      cwd: record.cwd,
      sessionId: record.acpSessionId,
    });

    if (acpSessionId !== record.acpSessionId) {
      this.db.orm
        .update(sessionTable)
        .set({ acpSessionId })
        .where(eq(sessionTable.id, record.id))
        .run();
    }
  }

  /**
   * Runs the agent prompt for a started turn and applies its response parts, completion, and
   * errors. Clears the prompt-running flag when the turn ends, completes, or fails.
   */
  private async runPrompt(action: AHPChatTurnStartedAction): Promise<void> {
    const { turnId } = action;
    const startedAt = Date.now();

    try {
      await this.openAgent();

      const responding = await this.applyToTurn(turnId, {
        type: AHPActionType.ChatResponsePart,
        turnId,
        part: { kind: AHPResponsePartKind.Markdown, id: turnId, content: "" },
      });

      if (!responding) {
        return;
      }

      const response = await this.agent.prompt(action.message.text, async (content) => {
        await this.applyToTurn(turnId, {
          type: AHPActionType.ChatDelta,
          turnId,
          partId: turnId,
          content,
        });
      });

      await this.applyToTurn(turnId, {
        type:
          response.stopReason === "cancelled"
            ? AHPActionType.ChatTurnCancelled
            : AHPActionType.ChatTurnComplete,
        turnId,
        duration: Date.now() - startedAt,
      });
    } catch (error) {
      await this.applyToTurn(turnId, {
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

  // Skipped once the turn is no longer active, for example after cancellation.
  private applyToTurn(turnId: string, action: AHPChatAction): Promise<boolean> {
    return this.apply((record) =>
      record.chatState.activeTurn?.id === turnId ? applyChat(record, action) : undefined,
    );
  }

  /** Applies a change and attempts host delivery. Throws when the session is absent. */
  private async applyExisting(
    change: (record: SessionRecord) => HostSessionUpdateRequest,
  ): Promise<void> {
    const saved = await this.apply(change);

    if (!saved) {
      throw new Error("Session does not exist");
    }
  }

  /**
   * Saves the record and its pending host update together, then attempts delivery.
   * Returns false when the session does not exist or the change is skipped.
   */
  private async apply(change: SessionChange): Promise<boolean> {
    const saved = await this.hostUpdates.save(change);

    if (saved) {
      try {
        await this.hostUpdates.flush();
      } catch (error) {
        console.error("Host update delivery interrupted", { error: errorMessage(error) });
      }
    }

    return saved;
  }

  private async removeRecord(defaultChat?: string): Promise<void> {
    const { db } = this;

    await db.transaction(async () => {
      const record = db.orm
        .select({ sessionState: sessionTable.sessionState })
        .from(sessionTable)
        .get();

      if (
        defaultChat !== undefined &&
        !isCurrentGeneration(record?.sessionState.defaultChat, defaultChat)
      ) {
        return;
      }

      // oxlint-disable-next-line drizzle/enforce-delete-with-where -- removes the only session row
      db.orm.delete(sessionTable).run();
      await this.hostUpdates.clear();
    });
  }
}

/**
 * Mega edge case but if a session is disposed and recreated with the same ID
 * it'll have the same ID but a different default chat id. We check against this.
 */
function isCurrentGeneration(defaultChat: string | undefined, chat: string): boolean {
  return defaultChat === chat;
}
