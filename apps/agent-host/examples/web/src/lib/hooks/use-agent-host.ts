import { useContext } from "react";
import { AgentHostContext, type AgentHostContextValue } from "./agent-host-context";

const ABSENT = void 0;

export function useAgentHost(): AgentHostContextValue {
  const context = useContext(AgentHostContext);

  if (context === ABSENT) {
    throw new Error("useAgentHost must be used within AgentHostProvider");
  }

  return context;
}
