import type { Snapshot } from "@microsoft/agent-host-protocol";
import { useState } from "react";
import { SessionStateSchema, type SessionState } from "@experiments/protocol-schemas/ahp";
import { dispatchAction } from "../ahp/dispatch";
import { reduceChat, reduceSession, parseChat, type ClientChatState } from "../ahp/state";
import { useAgentHost } from "./use-agent-host";
import { useAhpChannel } from "./use-ahp-channel";

const ABSENT = void 0;

type CommandState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

type SendMessage = (text: string) => Promise<void>;

type CancelTurn = () => Promise<void>;

type SessionView = {
  connection: "connecting" | "connected" | "error";
  session: ReturnType<typeof useAhpChannel<SessionState>>;
  chat: ReturnType<typeof useAhpChannel<ClientChatState>>;
  canSend: boolean;
  command: CommandState;
  sendMessage: SendMessage;
  cancelTurn: CancelTurn;
  loadEarlier(): Promise<void>;
};

function parseSession(value: Snapshot["state"]): SessionState {
  return SessionStateSchema.parse(value);
}

type UseAhpSessionParams = { sessionUri: string };

export function useAhpSession({ sessionUri }: UseAhpSessionParams): SessionView {
  const { view } = useAgentHost();
  const client = view.status === "connected" ? view.client : ABSENT;

  const session = useAhpChannel({
    client,
    uri: sessionUri,
    parse: parseSession,
    reduce: reduceSession,
  });

  const chatUri = session.status === "ready" ? session.state.defaultChat : ABSENT;

  const chat = useAhpChannel({
    client,
    uri: chatUri,
    parse: parseChat,
    reduce: reduceChat,
  });

  const [command, setCommand] = useState<CommandState>({ status: "idle" });

  const canSend =
    view.status === "connected" &&
    session.status === "ready" &&
    session.state.lifecycle === "ready" &&
    chat.status === "ready" &&
    chat.state.activeTurn === ABSENT &&
    command.status !== "pending";

  async function sendMessage(text: string): Promise<void> {
    if (!canSend || chatUri === ABSENT) {
      throw new Error("The session is not ready to receive a message.");
    }

    if (!text.trim()) {
      throw new Error("Enter a message before sending.");
    }

    setCommand({ status: "pending" });

    try {
      await dispatchAction({
        client: view.client,
        clientId: view.clientId,
        channel: chatUri,
        action: {
          type: "chat/turnStarted",
          turnId: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
          message: { text, origin: { kind: "user" } },
        },
      });
      setCommand({ status: "idle" });
    } catch (error) {
      setCommand({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function cancelTurn(): Promise<void> {
    if (view.status !== "connected" || chat.status !== "ready" || !chat.state.activeTurn) {
      throw new Error("There is no active turn to cancel.");
    }

    setCommand({ status: "pending" });

    try {
      await dispatchAction({
        client: view.client,
        clientId: view.clientId,
        channel: chat.state.resource,
        action: {
          type: "chat/turnCancelled",
          turnId: chat.state.activeTurn.id,
          duration: 0,
        },
      });
      setCommand({ status: "idle" });
    } catch (error) {
      setCommand({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function loadEarlier(): Promise<void> {
    if (
      view.status !== "connected" ||
      chat.status !== "ready" ||
      chat.state.turnsNextCursor === ABSENT
    ) {
      return;
    }

    await view.client.request("fetchTurns", {
      channel: chat.state.resource,
      cursor: chat.state.turnsNextCursor,
    });
  }

  return {
    connection: view.status,
    session,
    chat,
    canSend,
    command,
    sendMessage,
    cancelTurn,
    loadEarlier,
  };
}
