import { useCallback, useMemo } from "react";
import type { JSX, ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { AgentHostContext, type AgentHostContextValue } from "./agent-host-context";
import { useSessions } from "./use-sessions";

type AgentHostProviderParams = { children: ReactNode };

type HostConnectionParams = Omit<AgentHostContextValue, "view"> & AgentHostProviderParams;

function HostConnection({ host, setHost, children }: HostConnectionParams): JSX.Element {
  const view = useSessions(host);

  const value = useMemo(
    (): AgentHostContextValue => ({ host, setHost, view }),
    [host, setHost, view],
  );

  return <AgentHostContext value={value}>{children}</AgentHostContext>;
}

export function AgentHostProvider({ children }: AgentHostProviderParams): JSX.Element {
  const search = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const host = search.host ?? "example";

  const setHost = useCallback(
    (nextHost: string): void => {
      void navigate({ to: "/", search: { host: nextHost } });
    },
    [navigate],
  );

  return (
    <HostConnection key={host} host={host} setHost={setHost}>
      {children}
    </HostConnection>
  );
}
