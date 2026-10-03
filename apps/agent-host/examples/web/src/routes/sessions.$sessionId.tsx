import type { JSX, ReactNode } from "react";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAhpSession } from "../lib/hooks/use-ahp-session";
import { useAgentHost } from "../lib/hooks/use-agent-host";
import { Conversation } from "../features/sessions/Conversation";
import { PageHeader } from "../components/page-header";
import ThemeToggle from "../components/ThemeToggle";

const ABSENT = void 0;

const FIRST_WORKING_DIRECTORY = 0;

type CenteredParams = { children: ReactNode };

function Centered({ children }: CenteredParams): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
      {children}
    </div>
  );
}

type SessionDetailParams = { sessionId: string };

function SessionDetail({ sessionId }: SessionDetailParams): JSX.Element {
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

  const details = `${provider} · ${host}${workspace === ABSENT ? "" : ` · ${workspace}`}`;

  return (
    <div className="flex h-svh min-w-0 flex-1 flex-col">
      <PageHeader
        className="sticky top-0 z-10 shrink-0 border-b border-border bg-background px-4 sm:px-6"
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/sessions" search={{ host }}>
                    Sessions
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        description={details}
      >
        {connection.status === "connecting" && <Badge>Connecting…</Badge>}
        {connection.status === "error" && <Badge>Offline</Badge>}
        {connection.status === "connected" &&
          session.status === "ready" &&
          lifecycle === "creating" && <Badge>Starting agent…</Badge>}
        {connection.status === "connected" &&
          session.status === "ready" &&
          lifecycle === "failed" && <Badge>Failed</Badge>}
        <ThemeToggle />
      </PageHeader>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {connection.status === "connecting" && (
          <Centered>
            <p className="m-0 text-sm">Connecting to host…</p>
          </Centered>
        )}
        {connection.status === "error" && (
          <Centered>
            <Alert variant="destructive">
              <AlertTitle>Connection lost</AlertTitle>
              <AlertDescription>{connection.message}</AlertDescription>
            </Alert>
          </Centered>
        )}
        {connection.status === "connected" && session.status === "loading" && (
          <Centered>
            <p className="m-0 text-sm">Loading session…</p>
          </Centered>
        )}
        {session.status === "error" && (
          <Centered>
            <Alert variant="destructive">
              <AlertTitle>Could not load session</AlertTitle>
              <AlertDescription>{session.message}</AlertDescription>
            </Alert>
          </Centered>
        )}
        {session.status === "ready" && <Conversation view={view} />}
      </main>
    </div>
  );
}

function SessionPage(): JSX.Element {
  const { sessionId } = Route.useParams();

  return <SessionDetail key={sessionId} sessionId={sessionId} />;
}

export const Route = createFileRoute("/sessions/$sessionId")({
  component: SessionPage,
});
