import {
  MessageKind as AHPMessageKind,
  SessionStatus as AHPSessionStatus,
  type ActiveTurn as AHPActiveTurn,
  type ChatState as AHPChatState,
} from "@microsoft/agent-host-protocol";
import { describe, expect, it } from "vitest";

import { chatPhase } from "./chat-phase";

function activeTurn(): AHPActiveTurn {
  return {
    id: "turn-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    message: { text: "Go", origin: { kind: AHPMessageKind.User } },
    responseParts: [],
    usage: undefined,
  };
}

function chatWith(status: AHPSessionStatus, active?: AHPActiveTurn): AHPChatState {
  const chat: AHPChatState = {
    resource: "ahp-chat:/session/chat",
    title: "Chat",
    status,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    turns: [],
  };

  if (active !== undefined) {
    chat.activeTurn = active;
  }

  return chat;
}

describe("chatPhase", () => {
  it("reports streaming while a turn is active", () => {
    const state = chatWith(AHPSessionStatus.InProgress, activeTurn());

    expect(chatPhase(state)).toBe("streaming");
  });

  it("reports waiting while a turn is blocked on input", () => {
    const state = chatWith(AHPSessionStatus.InputNeeded, activeTurn());

    expect(chatPhase(state)).toBe("waiting");
  });

  it("reports error when the chat ended in error", () => {
    const state = chatWith(AHPSessionStatus.Error);

    expect(chatPhase(state)).toBe("error");
  });

  it("reports idle when no turn is active", () => {
    const status = AHPSessionStatus.Idle | AHPSessionStatus.IsRead;
    const state = chatWith(status);

    expect(chatPhase(state)).toBe("idle");
  });
});
