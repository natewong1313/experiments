import { waitUntil } from "cloudflare:workers";
import { RequestError as ACPRequestError } from "@agentclientprotocol/sdk";
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
import type { ActiveTurnText } from "./chat/store";
import { retryDelay } from "./lifecycle-policy";
import type { SessionLifecyclePolicy } from "./lifecycle-policy";
import { defaultChatOf } from "./records";
import type { ApplyOutcome, SessionChange } from "./records";
import { applyChat } from "./state";
import { TurnOutput } from "./turn-output";

type SessionTurnsOptions = {
  agent: AgentConnection;
  /** Opens the agent connection of the session if it is closed. */
  openAgent(): Promise<void>;
  /** Saves a change and pushes it. Returns `absent` if the session is absent or disposing. */
  applyChange(change: SessionChange): Promise<ApplyOutcome>;
  /** Returns the active turn of the default chat, or undefined if none is active. */
  activeTurn(): ActiveTurnText | undefined;
  /** Schedules the `continueTurn` alarm at `time`. Does nothing for an absent session. */
  scheduleContinue(time: number): Promise<void>;
  /** Returns the alarm timing of the open storage. */
  policy(): SessionLifecyclePolicy;
};

/** The prompt of one turn: its AHP ID, the text that the agent receives, and its start time. */
type TurnPrompt = { turnId: string; text: string; startedAt: number };

/**
 * Runs the chat turns of one session against its agent connection.
 *
 * A turn outlives its prompt run. The `continueTurn` alarm runs while a turn is active. After a
 * restart, it starts a new prompt run with the same operation ID, and an agent that supports
 * operation IDs reattaches it to the running prompt. An agent without that support cannot
 * continue the prompt, so the turn ends with an error.
 */
export class SessionTurns {
  private options: SessionTurnsOptions;
  /**
   * The claims on the agent session: one for the whole prompt run of a turn in this object, and
   * one for a cancellation that reaches the agent after a restart. A new turn starts only
   * without claims, so a pending cancellation cannot stop its prompt. A prompt run can continue
   * after a cancellation ends the active turn.
   */
  private claims = 0;
  // Failed reattachments in a row. A restart resets the count.
  private failures = 0;

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

    // The alarm comes before the turn, so a restart continues every recorded turn.
    // An alarm without an active turn does nothing.
    await this.scheduleHeartbeat();

    // `claimed` is true once this call claims the prompt. Only that call starts the prompt.
    // The callback sets it last, so a check that throws leaves it false.
    const admission = { claimed: false };

    try {
      const outcome = await this.options.applyChange((record, chats) => {
        const chat = defaultChatOf(record);

        // A retry of a recorded turn start is a no-op, also while the prompt of the turn runs.
        if (chats.hasTurn(chat, action.turnId)) {
          return;
        }

        if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
          throw new Error("Session is not ready");
        }

        // The prompt of a cancelled turn can still run, or be cancelled, after the turn ended.
        if (this.claims > 0 || chats.activeTurnId(chat) !== undefined) {
          throw new Error("A turn is already running");
        }

        this.claims += 1;
        admission.claimed = true;

        return applyChat(record, chats, action, origin);
      });

      if (outcome === "absent") {
        throw sessionNotFound();
      }
    } catch (error) {
      if (admission.claimed) {
        this.claims -= 1;
      }

      throw error;
    }

    if (admission.claimed) {
      const prompt = { turnId: action.turnId, text: message.text, startedAt: Date.now() };
      waitUntil(this.runPrompt(prompt, false));
    }
  }

  /**
   * Runs the `continueTurn` alarm. While a turn is active, schedules the next run. If no prompt
   * of this object runs the turn, as after a restart, starts a prompt run that reattaches to it.
   */
  async continue(): Promise<void> {
    const turn = this.options.activeTurn();

    if (!turn) {
      return;
    }

    await this.scheduleHeartbeat();

    // While a turn is active, only its prompt run can hold a claim.
    if (this.claims > 0) {
      return;
    }

    this.claims += 1;
    const prompt = promptOf(turn);
    waitUntil(this.runPrompt(prompt, true));
  }

  /**
   * Cancels the active turn and tells the agent to stop the running prompt. A retry of a
   * cancellation that already ended the turn is a no-op, so a retried call does not cancel
   * the agent twice.
   *
   * The cancellation claims the agent session in the same change that ends the turn, and keeps
   * the claim until the agent receives it. A new turn cannot start before then, so the
   * cancellation does not stop its prompt.
   */
  async cancel(request: TurnCancelledRequest, origin: AHPActionOrigin): Promise<void> {
    // `claimed` is true once this call claims the agent session.
    // The callback sets it last, so a check that throws leaves it false.
    const cancellation = { claimed: false };

    try {
      const outcome = await this.options.applyChange((record, chats) => {
        const chat = defaultChatOf(record);

        if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
          throw new Error("Session is not ready");
        }

        if (chats.activeTurnId(chat) === request.turnId) {
          const cancelled = { ...request, type: AHPActionType.ChatTurnCancelled } as const;
          const change = applyChat(record, chats, cancelled, origin);

          if (!cancellation.claimed) {
            this.claims += 1;
            cancellation.claimed = true;
          }

          return change;
        }

        // A retry of a cancellation reaches the session after the turn ended. Treat it as a no-op.
        if (chats.hasTurn(chat, request.turnId)) {
          return;
        }

        throw new Error("No matching active turn to cancel");
      });

      if (outcome === "absent") {
        throw sessionNotFound();
      }

      // Only the cancellation that ended the active turn tells the agent to stop.
      if (outcome !== "applied") {
        return;
      }

      // After a restart, the agent can still run the prompt of the turn without a connection.
      // A reattaching run can still wait for its connection, and this call joins that attempt.
      try {
        await this.options.openAgent();
      } catch (error) {
        // The turn ended. The agent finishes its prompt on its own.
        console.error("Agent connection for cancellation failed", { error: errorMessage(error) });

        return;
      }

      await this.options.agent.cancel();
    } finally {
      if (cancellation.claimed) {
        this.claims -= 1;
      }
    }
  }

  /**
   * Runs the agent prompt of a turn and applies its response parts, completion, and errors.
   * A reattaching run continues the response of the turn. Releases its claim when the run ends.
   */
  private async runPrompt(prompt: TurnPrompt, reattach: boolean): Promise<void> {
    const { turnId } = prompt;
    // A reattachment can retry until a connection shows that the agent cannot reattach.
    let reattachable = reattach;

    try {
      await this.options.openAgent();
      reattachable = this.options.agent.supportsOperations();

      if (reattach && !reattachable) {
        throw new Error("Turn interrupted by session restart");
      }

      const output = await this.openOutput(prompt, reattach);

      if (!output) {
        return;
      }

      const response = await this.options.agent.prompt(
        prompt.text,
        async (text) => {
          await output.write(text);
        },
        { operationId: turnId, reattach },
      );

      this.failures = 0;

      await this.applyToTurn(turnId, {
        type:
          response.stopReason === "cancelled"
            ? AHPActionType.ChatTurnCancelled
            : AHPActionType.ChatTurnComplete,
        turnId,
        duration: Date.now() - prompt.startedAt,
      });
    } catch (error) {
      await this.fail(prompt, error, reattachable);
    } finally {
      this.claims -= 1;
    }
  }

  /**
   * Schedules another reattachment of the prompt, or ends the turn with `cause` if a new
   * connection cannot continue it. A restart of this object also fails these writes, and the
   * next object continues the turn, so a failure here is only logged.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  private async fail(prompt: TurnPrompt, cause: unknown, reattachable: boolean): Promise<void> {
    try {
      if (reattachable && (await this.retryLater(cause))) {
        return;
      }

      await this.applyToTurn(prompt.turnId, {
        type: AHPActionType.ChatError,
        turnId: prompt.turnId,
        duration: Date.now() - prompt.startedAt,
        part: {
          kind: AHPResponsePartKind.Error,
          error: { errorType: "agent", message: errorMessage(cause) },
        },
      });
    } catch (error) {
      console.error("Turn failure was not recorded", { error: errorMessage(error) });
    }
  }

  /**
   * Returns the output of a prompt run, or undefined if the turn is no longer active. A new turn
   * gets an empty markdown part. A reattaching run continues the last markdown part of the turn.
   */
  private async openOutput(prompt: TurnPrompt, reattach: boolean): Promise<TurnOutput | undefined> {
    const { turnId } = prompt;
    const stored = reattach ? this.options.activeTurn() : undefined;

    if (reattach && stored?.turnId !== turnId) {
      return;
    }

    if (stored?.markdown) {
      return new TurnOutput(turnId, stored.markdown, this.applyToTurn.bind(this));
    }

    const responding = await this.applyToTurn(turnId, {
      type: AHPActionType.ChatResponsePart,
      turnId,
      part: { kind: AHPResponsePartKind.Markdown, id: turnId, content: "" },
    });

    return responding
      ? new TurnOutput(turnId, { id: turnId, content: "" }, this.applyToTurn.bind(this))
      : undefined;
  }

  /**
   * Schedules another reattachment after a failure that a new connection can fix, such as a
   * closed connection. Returns false if the agent answered with an error, or after the last
   * attempt.
   */
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- error comes from a catch binding
  private async retryLater(error: unknown): Promise<boolean> {
    const policy = this.options.policy();

    if (error instanceof ACPRequestError || this.failures + 1 >= policy.turnAttempts) {
      this.failures = 0;

      return false;
    }

    this.failures += 1;
    await this.options.scheduleContinue(Date.now() + retryDelay(policy, this.failures));

    return true;
  }

  private async scheduleHeartbeat(): Promise<void> {
    await this.options.scheduleContinue(Date.now() + this.options.policy().turnHeartbeatMs);
  }

  /**
   * Applies `action` while `turnId` is the active turn. Returns false after the turn stops being
   * active, for example after a cancellation.
   */
  private async applyToTurn(turnId: string, action: AHPChatAction): Promise<boolean> {
    const outcome = await this.options.applyChange((record, chats) =>
      chats.activeTurnId(defaultChatOf(record)) === turnId
        ? applyChat(record, chats, action)
        : undefined,
    );

    return outcome === "applied";
  }
}

/** Returns the prompt that continues a stored turn. The duration counts from its start. */
function promptOf(turn: ActiveTurnText): TurnPrompt {
  const startedAt = turn.startedAt === null ? Number.NaN : Date.parse(turn.startedAt);

  return {
    turnId: turn.turnId,
    text: turn.text,
    startedAt: Number.isFinite(startedAt) ? Math.min(startedAt, Date.now()) : Date.now(),
  };
}
