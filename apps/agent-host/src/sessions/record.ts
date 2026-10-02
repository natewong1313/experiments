import type {
  ChatState,
  SessionState,
} from "@experiments/protocol-schemas/ahp";

const IDLE = 1;

type LiveSession = {
  uri: string;
  chatUri: string;
  sessionKey: string;
  acpSession: string | null;
  createdAt: string;
  modifiedAt: string;
  session: SessionState;
  chat: ChatState;
};
type SessionGeneration = Pick<LiveSession, "uri" | "sessionKey">;
type AgentBinding = Pick<
  LiveSession,
  "uri" | "sessionKey" | "acpSession" | "session"
>;

export { IDLE, type LiveSession, type SessionGeneration, type AgentBinding };
