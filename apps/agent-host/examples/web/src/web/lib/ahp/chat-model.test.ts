import {
  MessageKind as AHPMessageKind,
  SessionStatus as AHPSessionStatus,
  TurnState as AHPTurnState,
  type ActiveTurn as AHPActiveTurn,
  type ChatState as AHPChatState,
  type Turn as AHPTurn,
} from "@microsoft/agent-host-protocol";
import { describe, expect, it } from "vitest";

import { chatModel } from "./chat-model";

/** Builds the message that starts a turn, on `modelId` when there is one. */
function message(modelId?: string): AHPTurn["message"] {
  const base = { text: "Hello", origin: { kind: AHPMessageKind.User } };

  return modelId === undefined ? base : { ...base, model: { id: modelId } };
}

/** Builds a completed turn that ran on `modelId`, or on no model when it is absent. */
function turn(id: string, modelId?: string): AHPTurn {
  return {
    id,
    message: message(modelId),
    responseParts: [],
    usage: undefined,
    state: AHPTurnState.Complete,
  };
}

/** Builds the active turn of a chat. */
function activeTurn(modelId: string): AHPActiveTurn {
  return {
    id: "active",
    startedAt: "2026-01-01T00:00:01.000Z",
    message: message(modelId),
    responseParts: [],
    usage: undefined,
  };
}

/** Builds a chat state with `turns` and an optional active turn. */
function chatWith(turns: AHPTurn[], active?: AHPActiveTurn): AHPChatState {
  const chat: AHPChatState = {
    resource: "ahp-chat:/session/chat",
    title: "Chat",
    status: AHPSessionStatus.Idle,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    turns,
  };

  if (active !== undefined) {
    chat.activeTurn = active;
  }

  return chat;
}

describe("chatModel", () => {
  it("reports the model of the newest turn", () => {
    const chat = chatWith([turn("one", "kimi"), turn("two", "deepseek")]);

    expect(chatModel(chat)).toBe("deepseek");
  });

  it("reports the model of the active turn over the completed turns", () => {
    const chat = chatWith([turn("one", "kimi")], activeTurn("deepseek"));

    expect(chatModel(chat)).toBe("deepseek");
  });

  it("reports nothing when no turn chose a model", () => {
    const chat = chatWith([turn("one")]);

    expect(chatModel(chat)).toBeUndefined();
  });

  it("reports nothing for a chat without turns", () => {
    const chat = chatWith([]);

    expect(chatModel(chat)).toBeUndefined();
  });

  it("reports nothing before the snapshot arrives", () => {
    const missing: AHPChatState | undefined = undefined;

    expect(chatModel(missing)).toBeUndefined();
  });
});
