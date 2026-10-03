import type { JSX, ReactNode } from "react";
import { Badge, Banner, Text } from "@cloudflare/kumo";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAhpSession } from "../hooks/use-ahp-session";
import { useAgentHost } from "../hooks/use-agent-host";
import { Conversation } from "../components/Conversation";

const ABSENT = void 0;

const APP_HEADER_HEIGHT_PX = "58px";

const FIRST_WORKING_DIRECTORY = 0;

function Centered({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-kumo-subtle">{children}</div>
  );
}

function SessionDetail({ sessionId }: { sessionId: string }): JSX.Element {
  const { host, view: connection } = useAgentHost();
  const sessionUri = `ahp-session:/${sessionId}`;
  const view = useAhpSession({ sessionUri });

  const { session } = view;

  const ready = session.status === "ready";
  const title = ready ? session.state.title : "Session";
  const lifecycle = ready ? session.state.lifecycle : ABSENT;
  const provider = ready ? session.state.provider : "pi";

  const workspace = ready
    ? (session.state.workingDirectories?.[FIRST_WORKING_DIRECTORY] ?? ABSENT)
    : ABSENT;

  return (
    <main
      className="flex min-w-0 flex-col"
      style={{ height: `calc(100svh - ${APP_HEADER_HEIGHT_PX})` }}
    >
      <header className="flex items-center gap-2 border-b border-kumo-line bg-kumo-base px-3 py-2.5 sm:px-6">
        <Link
          to="/sessions"
          search={{ host }}
          aria-label="Back to sessions"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus"
        >
          <CaretLeftIcon size={18} />
        </Link>
        <div className="grid min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-medium">{title}</p>
          <p className="m-0 truncate text-xs text-kumo-subtle">
            {provider} · {host}
            {workspace === ABSENT ? "" : ` · ${workspace}`}
          </p>
        </div>
        {connection.status === "connecting" && <Badge>Connecting…</Badge>}
        {connection.status === "error" && <Badge>Offline</Badge>}
        {connection.status === "connected" &&
          session.status === "ready" &&
          lifecycle === "creating" && <Badge>Starting agent…</Badge>}
        {connection.status === "connected" &&
          session.status === "ready" &&
          lifecycle === "failed" && <Badge>Failed</Badge>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {connection.status === "connecting" && (
          <Centered>
            <Text variant="secondary">Connecting to host…</Text>
          </Centered>
        )}
        {connection.status === "error" && (
          <Centered>
            <Banner variant="error" title="Connection lost" description={connection.message} />
          </Centered>
        )}
        {connection.status === "connected" && session.status === "loading" && (
          <Centered>
            <Text variant="secondary">Loading session…</Text>
          </Centered>
        )}
        {session.status === "error" && (
          <Centered>
            <Banner variant="error" title="Could not load session" description={session.message} />
          </Centered>
        )}
        {session.status === "ready" && <Conversation view={view} />}
      </div>
    </main>
  );
}

function SessionPage(): JSX.Element {
  const { sessionId } = Route.useParams();

  return <SessionDetail key={sessionId} sessionId={sessionId} />;
}

export const Route = createFileRoute("/sessions/$sessionId")({
  component: SessionPage,
});
