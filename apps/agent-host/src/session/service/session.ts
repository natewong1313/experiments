import { waitUntil } from "cloudflare:workers";
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
import { chatUri } from "../../shared/lookups";
import { sessionNotFound } from "../../shared/protocol";
import { toAHPError } from "../../shared/rpc/errors";
import type { SessionUpdate } from "../../shared/rpc/router";
import type { SessionCreateRequest, SessionDispatchRequest } from "../../shared/rpc/session";
import type { SessionRecord } from "../db/schema";
import { applyChat, applySession, buildSession } from "../state";
import { AgentConnection } from "./agent";
import type { SessionStore } from "./store";

type SessionServiceOptions = {
  store: SessionStore;
  workingDirectory(): string;
  connectAgent(sessionId: string): Promise<ACPStream>;
};

/**
 * Runs the chat turns of the session against the connected agent. The store keeps the
 * session record and pushes each change to subscribers.
 */
export class SessionService {
  // True for the whole prompt run of a turn.
  // The run can continue after a cancellation ends the active turn.
  private promptRunning = false;
  private agent = new AgentConnection();
  private options: SessionServiceOptions;
  private store: SessionStore;

  constructor(options: SessionServiceOptions) {
    this.options = options;
    this.store = options.store;
  }

  /**
   * Opens existing storage after a restart and records an error for any active turn. The
   * session does not store the agent connection. Thus a running turn cannot resume.
   *
   * TODO: support resuming turns
   */
  async load(): Promise<void> {
    await this.store.load((record) => {
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

  /**
   * Creates the session record and opens the agent connection. On failure, records a
   * creation error, removes the session, and rethrows.
   */
  async create(options: SessionCreateRequest): Promise<void> {
    const cwd = options.workingDirectory ?? this.options.workingDirectory();

    if (!cwd.startsWith("/")) {
      throw new Error("Working directory must be an absolute path");
    }

    await this.store.insert(buildSession(options, cwd));
    const defaultChat = chatUri(options.sessionId, options.chatId);

    try {
      await this.openAgent();
      await this.applyExisting((record) =>
        applySession(record, { type: AHPActionType.SessionReady }),
      );
      // The first summary from the host does not have the working directories. This sync adds them.
      await this.store.syncCatalogue();
    } catch (error) {
      await this.handleCreationFailed(error, defaultChat);
      throw error;
    }
  }

  /** Routes a dispatched action to turn start or cancellation. */
  async dispatch({ channel, action, origin }: SessionDispatchRequest): Promise<void> {
    const record = this.store.requireRecord();

    if (channel !== record.sessionState.defaultChat) {
      throw new Error("Channel does not belong to this session");
    }

    await (action.type === "chat/turnStarted"
      ? this.startTurn(action, origin)
      : this.cancelTurn(action, origin));
  }

  /** Removes the session and cancels and closes the agent connection. */
  async dispose(): Promise<void> {
    try {
      // `remove` stops new changes before it waits.
      // This prevents the cancellation from adding a revision.
      // This method reports the first failure only after both steps finish.
      const results = await Promise.allSettled([this.store.remove(), this.agent.cancel()]);
      const failure = results.find((result) => result.status === "rejected");

      if (failure) {
        throw toAHPError(failure.reason);
      }
    } finally {
      this.agent.close();
    }
  }

  /**
   * Closes the agent, records a creation-failed action, and removes the session. Does nothing
   * if the stored session has a different `defaultChat`, because then it is a new session.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- error comes from a catch binding
  private async handleCreationFailed(error: unknown, defaultChat: string): Promise<void> {
    if (this.store.record()?.sessionState.defaultChat !== defaultChat) {
      return;
    }

    this.agent.close();

    try {
      await this.store.apply((record) =>
        applySession(record, {
          type: AHPActionType.SessionCreationFailed,
          error: { errorType: "agent", message: errorMessage(error) },
        }),
      );
    } finally {
      await this.store.remove();
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
   * Opens the agent connection and stores the ACP session ID if the agent assigns a new one.
   */
  private async openAgent(): Promise<void> {
    const record = this.store.requireRecord();
    const { defaultChat } = record.sessionState;

    const acpSessionId = await this.agent.open({
      stream: (): Promise<ACPStream> => this.options.connectAgent(record.id),
      cwd: record.cwd,
      sessionId: record.acpSessionId,
    });

    // The host can dispose the session while the agent connection opens.
    if (this.store.record()?.sessionState.defaultChat !== defaultChat) {
      throw sessionNotFound();
    }

    if (defaultChat !== undefined && acpSessionId !== record.acpSessionId) {
      this.store.setAcpSessionId(defaultChat, acpSessionId);
    }
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

  /**
   * Applies `action` while `turnId` is the active turn. Returns false after the turn stops being
   * active, for example after a cancellation.
   */
  private applyToTurn(turnId: string, action: AHPChatAction): Promise<boolean> {
    return this.store.apply((record) =>
      record.chatState.activeTurn?.id === turnId ? applyChat(record, action) : undefined,
    );
  }

  /** Applies a change and pushes it. Throws when the session is absent. */
  private async applyExisting(change: (record: SessionRecord) => SessionUpdate): Promise<void> {
    const saved = await this.store.apply(change);

    if (!saved) {
      throw sessionNotFound();
    }
  }
}
