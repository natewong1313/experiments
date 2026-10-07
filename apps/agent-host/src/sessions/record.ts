import type { LiveSession } from "../state";

type SessionGeneration = Pick<LiveSession, "uri" | "sessionKey">;

type AgentBinding = Pick<LiveSession, "uri" | "sessionKey" | "acpSession"> & {
  session: Pick<LiveSession["session"], "workingDirectories">;
};

export type { SessionGeneration, AgentBinding };
