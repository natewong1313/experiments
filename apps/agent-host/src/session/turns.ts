import { waitUntil } from "cloudflare:workers";
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
import { errorMessage } from "../shared/errors";
import { sessionNotFound } from "../shared/protocol";
import type { SessionUpdate } from "../shared/rpc/router";
import type { AgentConnection } from "./agent-connection";
import type { SessionRecord } from "./db/schema";
import type { SessionChange } from "./records";
import { applyChat } from "./state";

type SessionTurnsOptions = {
  agent: AgentConnection;
  /** Opens the agent connection of the session if it is closed. */
  openAgent(): Promise<void>;
  /** Saves a change and pushes it. Returns false if the session is absent or disposing. */
  applyChange(change: SessionChange): Promise<boolean>;
};

/** Runs the chat turns of one session against its agent connection. */
export class SessionTurns {
  private options: SessionTurnsOptions;
  // True for the whole prompt run of a turn.
  // The run can continue after a cancellation ends the active turn.
  private promptRunning = false;

  constructor(options: SessionTurnsOptions) {
    this.options = options;
  }

  /**
   * Validates a user text message, records the turn, and starts the prompt in the background.
   */
  async start(request: TurnStartedRequest, origin: AHPActionOrigin): Promise<void> {
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

  /** Cancels the active turn and tells the agent to stop the running prompt. */
  async cancel(request: TurnCancelledRequest, origin: AHPActionOrigin): Promise<void> {
    await this.applyExisting((record) => {
      if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
        throw new Error("Session is not ready");
      }

      if (record.chatState.activeTurn?.id !== request.turnId) {
        throw new Error("No matching active turn to cancel");
      }

      return applyChat(record, { ...request, type: AHPActionType.ChatTurnCancelled }, origin);
    });

    await this.options.agent.cancel();
  }

  /**
   * Runs the agent prompt for a started turn and applies its response parts, completion, and
   * errors. Clears `promptRunning` when the prompt run ends.
   */
  private async runPrompt(action: AHPChatTurnStartedAction): Promise<void> {
    const { turnId } = action;
    const startedAt = Date.now();

    try {
      await this.options.openAgent();

      const responding = await this.applyToTurn(turnId, {
        type: AHPActionType.ChatResponsePart,
        turnId,
        part: { kind: AHPResponsePartKind.Markdown, id: turnId, content: "" },
      });

      if (!responding) {
        return;
      }

      const response = await this.options.agent.prompt(action.message.text, async (content) => {
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

  /** Applies a change and pushes it. Throws when the session is absent. */
  private async applyExisting(change: (record: SessionRecord) => SessionUpdate): Promise<void> {
    const saved = await this.options.applyChange(change);

    if (!saved) {
      throw sessionNotFound();
    }
  }

  /**
   * Applies `action` while `turnId` is the active turn. Returns false after the turn stops being
   * active, for example after a cancellation.
   */
  private applyToTurn(turnId: string, action: AHPChatAction): Promise<boolean> {
    return this.options.applyChange((record) =>
      record.chatState.activeTurn?.id === turnId ? applyChat(record, action) : undefined,
    );
  }
}
