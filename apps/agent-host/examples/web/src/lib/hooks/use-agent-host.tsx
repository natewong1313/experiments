import { createContext, useContext } from "react";
import type { JSX, ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSessions } from "./use-sessions";

const ABSENT = void 0;

type SetHost = (host: string) => void;

type AgentHostContextValue = {
  host: string;
  setHost: SetHost;
  view: ReturnType<typeof useSessions>;
};

const AgentHostContext = createContext<AgentHostContextValue | undefined>(ABSENT);

type AgentHostProviderParams = { children: ReactNode };

type HostConnectionParams = Omit<AgentHostContextValue, "view"> & AgentHostProviderParams;

function HostConnection({ host, setHost, children }: HostConnectionParams): JSX.Element {
  const view = useSessions(host);

  return <AgentHostContext value={{ host, setHost, view }}>{children}</AgentHostContext>;
}

function AgentHostProvider({ children }: AgentHostProviderParams): JSX.Element {
  const search = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const host = search.host ?? "example";

  function setHost(nextHost: string): void {
    void navigate({ to: "/", search: { host: nextHost } });
  }

  return (
    <HostConnection key={host} host={host} setHost={setHost}>
      {children}
    </HostConnection>
  );
}

function useAgentHost(): AgentHostContextValue {
  const context = useContext(AgentHostContext);

  if (context === ABSENT) {
    throw new Error("useAgentHost must be used within AgentHostProvider");
  }

  return context;
}

export { AgentHostProvider, useAgentHost };
