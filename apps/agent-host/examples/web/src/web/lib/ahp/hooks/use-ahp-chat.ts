import {
  ActionType as AHPActionType,
  ToolCallCancellationReason as AHPToolCallCancellationReason,
  ToolCallConfirmationReason as AHPToolCallConfirmationReason,
  MessageKind as AHPMessageKind,
  chatReducer as AHPchatReducer,
  type ChatState as AHPChatState,
  type Message as AHPMessage,
  type URI as AHPURI,
} from "@microsoft/agent-host-protocol";
import type { AhpClient } from "@microsoft/agent-host-protocol/client";
import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "~/lib/error-message";
import { chatModel } from "../chat-model";
import { chatPhase, type AhpChatPhase } from "../chat-phase";
import { isChatAction, isChatState } from "../guards";

const TURN_WINDOW = 50;

export type AhpChatController = {
  state: AHPChatState | undefined;
  phase: AhpChatPhase;
  model: string | undefined;
  /** Transport errors, subscription errors, and host rejections share this field. */
  error: string | null;
  /** If `modelId` is omitted, the host uses the session model. */
  send(text: string, modelId?: string): void;
  stop(): void;
  confirmToolCall(turnId: string, toolCallId: string, approved: boolean): void;
  confirmToolResult(turnId: string, toolCallId: string, approved: boolean): void;
};

type ChatHandlers = {
  onState(state: AHPChatState): void;
  onRejected(reason: string): void;
  onAccepted(): void;
};

/**
 * Cleanup unsubscribes the client from the entire chat channel.
 * Only one component can own that channel subscription at a time.
 */
function watchChat(
  client: AhpClient,
  chat: AHPURI,
  signal: AbortSignal,
  handlers: ChatHandlers,
): () => void {
  async function run(): Promise<void> {
    try {
      const subscribed = await client.subscribe(chat, { view: { turns: TURN_WINDOW } });
      const { snapshot } = subscribed.result;

      if (snapshot === undefined || !isChatState(snapshot.state)) {
        throw new Error("Chat channel returned no state");
      }

      let current = snapshot.state;
      handlers.onState(current);

      for await (const event of subscribed.subscription) {
        if (event.type !== "action") {
          continue;
        }

        const { action, rejectionReason } = event.params;

        if (rejectionReason !== undefined) {
          handlers.onRejected(rejectionReason);

          continue;
        }

        if (isChatAction(action)) {
          current = AHPchatReducer(current, action);
          handlers.onState(current);
          handlers.onAccepted();
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        handlers.onRejected(errorMessage(error));
      }
    }
  }

  void run();

  return (): void => {
    void client.unsubscribe(chat);
  };
}

/**
 * The hook applies actions only after the host returns them. It does not update state optimistically.
 *
 * @param client - A connected AHP client, or `undefined` while connecting.
 * @param chat - The chat channel URI, or `undefined` while the session loads.
 */
export function useAhpChat(
  client: AhpClient | undefined,
  chat: AHPURI | undefined,
): AhpChatController {
  const [state, setState] = useState<AHPChatState>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client === undefined || chat === undefined) {
      return;
    }

    setState(undefined);
    setError(null);

    const controller = new AbortController();

    const handlers: ChatHandlers = {
      onState: setState,
      onRejected: setError,
      onAccepted: (): void => {
        setError(null);
      },
    };

    const stopWatching = watchChat(client, chat, controller.signal, handlers);

    return (): void => {
      controller.abort();
      stopWatching();
    };
  }, [client, chat]);

  const send = useCallback(
    (text: string, modelId?: string): void => {
      if (client === undefined || chat === undefined) {
        return;
      }

      const message: AHPMessage = { text, origin: { kind: AHPMessageKind.User } };

      if (modelId !== undefined) {
        message.model = { id: modelId };
      }

      client.dispatch(chat, {
        type: AHPActionType.ChatTurnStarted,
        turnId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        message,
      });
    },
    [client, chat],
  );

  const stop = useCallback((): void => {
    const turn = state?.activeTurn;

    if (client === undefined || chat === undefined || turn === undefined) {
      return;
    }

    client.dispatch(chat, {
      type: AHPActionType.ChatTurnCancelled,
      turnId: turn.id,
      duration: elapsedSince(turn.startedAt),
    });
  }, [client, chat, state]);

  const confirmToolCall = useCallback(
    (turnId: string, toolCallId: string, approved: boolean): void => {
      if (client === undefined || chat === undefined) {
        return;
      }

      client.dispatch(
        chat,
        approved
          ? {
              type: AHPActionType.ChatToolCallConfirmed,
              turnId,
              toolCallId,
              approved: true,
              confirmed: AHPToolCallConfirmationReason.UserAction,
            }
          : {
              type: AHPActionType.ChatToolCallConfirmed,
              turnId,
              toolCallId,
              approved: false,
              reason: AHPToolCallCancellationReason.Denied,
            },
      );
    },
    [client, chat],
  );

  const confirmToolResult = useCallback(
    (turnId: string, toolCallId: string, approved: boolean): void => {
      if (client === undefined || chat === undefined) {
        return;
      }

      client.dispatch(chat, {
        type: AHPActionType.ChatToolCallResultConfirmed,
        turnId,
        toolCallId,
        approved,
      });
    },
    [client, chat],
  );

  return {
    state,
    phase: state === undefined ? "idle" : chatPhase(state),
    model: chatModel(state),
    error,
    send,
    stop,
    confirmToolCall,
    confirmToolResult,
  };
}

/** Turn durations use milliseconds. An invalid start timestamp produces a zero duration. */
function elapsedSince(startedAt: string): number {
  const started = Date.parse(startedAt);

  return Number.isNaN(started) ? 0 : Date.now() - started;
}
