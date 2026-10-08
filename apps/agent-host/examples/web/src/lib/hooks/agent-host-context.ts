import { createContext } from "react";
import type { useSessions } from "./use-sessions";

const ABSENT = void 0;

type SetHost = (host: string) => void;

export type AgentHostContextValue = {
  host: string;
  setHost: SetHost;
  view: ReturnType<typeof useSessions>;
};

export const AgentHostContext = createContext<AgentHostContextValue | undefined>(ABSENT);
