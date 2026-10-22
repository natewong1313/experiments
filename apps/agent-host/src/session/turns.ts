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
import type { AgentConnection } from "./agent-connection";
import type { SessionRecord } from "./db/schema";
import type { ApplyOutcome, SessionChange } from "./records";
import { applyChat } from "./state";

type SessionTurnsOptions = {
  agent: AgentConnection;
  /** Opens the agent connection of the session if it is closed. */
  openAgent(): Promise<void>;
  /** Saves a change and pushes it. Returns `absent` if the session is absent or disposing. */
  applyChange(change: SessionChange): Promise<ApplyOutcome>;
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

    // `claimed` is true once this call claims the prompt. Only that call starts the prompt.
    // The callback sets it last, so a check that throws leaves it false.
    const admission = { claimed: false };

    try {
      const outcome = await this.options.applyChange((record) => {
        // A retry of a recorded turn start is a no-op, also while the prompt of the turn runs.
        if (hasTurn(record, action.turnId)) {
          return;
        }

        if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
          throw new Error("Session is not ready");
        }

        // The prompt of a cancelled turn can still run after the turn ended.
        if (this.promptRunning || record.chatState.activeTurn) {
          throw new Error("A turn is already running");
        }

        this.promptRunning = true;
        admission.claimed = true;

        return applyChat(record, action, origin);
      });

      if (outcome === "absent") {
        throw sessionNotFound();
      }
    } catch (error) {
      if (admission.claimed) {
        this.promptRunning = false;
      }

      throw error;
    }

    if (admission.claimed) {
      waitUntil(this.runPrompt(action));
    }
  }

  /**
   * Cancels the active turn and tells the agent to stop the running prompt. A retry of a
   * cancellation that already ended the turn is a no-op, so a retried call does not cancel
   * the agent twice.
   */
  async cancel(request: TurnCancelledRequest, origin: AHPActionOrigin): Promise<void> {
    const outcome = await this.options.applyChange((record) => {
      if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
        throw new Error("Session is not ready");
      }

      if (record.chatState.activeTurn?.id === request.turnId) {
        return applyChat(record, { ...request, type: AHPActionType.ChatTurnCancelled }, origin);
      }

      // A retry of a cancellation reaches the session after the turn ended. Treat it as a no-op.
      if (record.chatState.turns.some((turn) => turn.id === request.turnId)) {
        return;
      }

      throw new Error("No matching active turn to cancel");
    });

    if (outcome === "absent") {
      throw sessionNotFound();
    }

    // Only the cancellation that ended the active turn tells the agent to stop.
    if (outcome === "applied") {
      await this.options.agent.cancel();
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

  /**
   * Applies `action` while `turnId` is the active turn. Returns false after the turn stops being
   * active, for example after a cancellation.
   */
  private async applyToTurn(turnId: string, action: AHPChatAction): Promise<boolean> {
    const outcome = await this.options.applyChange((record) =>
      record.chatState.activeTurn?.id === turnId ? applyChat(record, action) : undefined,
    );

    return outcome === "applied";
  }
}

/** Returns true if `record` has a turn with `turnId`, active or ended. */
function hasTurn(record: SessionRecord, turnId: string): boolean {
  return (
    record.chatState.activeTurn?.id === turnId ||
    record.chatState.turns.some((turn) => turn.id === turnId)
  );
}
