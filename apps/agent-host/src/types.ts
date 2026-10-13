import type { ActionEnvelope } from "@experiments/protocol-schemas/ahp";
import type {
  ActionOrigin,
  ChatAction,
  SessionAction,
  SessionSummary,
  SessionState,
  ChatState,
} from "@microsoft/agent-host-protocol";

export type SessionSummaryData = Omit<SessionSummary, "resource">;

export type CreateSessionOptions = {
  hostId: string;
  sessionId: string;
  chatId: string;
  provider: string;
  createdAt: string;
  workingDirectory?: string;
};

export type SessionPublication = {
  sessionId: string;
  revision: number;
  summary: SessionSummaryData;
  actions: { channel: string; action: ChatAction | SessionAction; origin?: ActionOrigin }[];
};

export type SessionSnapshot = {
  revision: number;
  state: SessionState | ChatState;
};

export type DeliveredAction = { envelope: ActionEnvelope; revision: number };
