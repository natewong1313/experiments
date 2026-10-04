import { createContext } from "react";
import type { useSessions } from "./use-sessions";

const ABSENT = void 0;

type SetHost = (host: string) => void;

type AgentHostContextValue = {
  host: string;
  setHost: SetHost;
  view: ReturnType<typeof useSessions>;
};

const AgentHostContext = createContext<AgentHostContextValue | undefined>(ABSENT);

export { AgentHostContext };

export type { AgentHostContextValue };
