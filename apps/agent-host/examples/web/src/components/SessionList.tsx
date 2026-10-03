import { useState } from "react";
import type { JSX } from "react";
import { Badge, Banner, Button, Empty, LayerCard, Table, Text } from "@cloudflare/kumo";
import { PlusIcon, StackIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { SessionStatus } from "@microsoft/agent-host-protocol";
import type { CreateSession } from "../hooks/use-sessions";
import { useAgentHost } from "../hooks/use-agent-host";

const ABSENT = void 0;

const SESSION_STATUS = {
  error: 2,
  inProgress: 8,
  inputNeeded: 24,
  archived: 64,
} satisfies Record<string, SessionStatus>;

function sessionStatus(status: SessionStatus): string {
  if ((status & SESSION_STATUS.inputNeeded) === SESSION_STATUS.inputNeeded) {
    return "Input needed";
  }

  if (status & SESSION_STATUS.inProgress) {
    return "In progress";
  }

  if (status & SESSION_STATUS.error) {
    return "Error";
  }

  return "Idle";
}

type CreationState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "error"; message: string };

function CreateSessionButton({ createSession }: { createSession: CreateSession }): JSX.Element {
  const [creation, setCreation] = useState<CreationState>({ status: "idle" });

  async function create(): Promise<void> {
    setCreation({ status: "creating" });

    try {
      await createSession();
      setCreation({ status: "idle" });
    } catch (error) {
      setCreation({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className="grid gap-1.5">
      <Button
        variant="primary"
        icon={PlusIcon}
        loading={creation.status === "creating"}
        type="button"
        disabled={creation.status === "creating"}
        onClick={() => {
          void create();
        }}
      >
        {creation.status === "creating" ? "Creating…" : "Create session"}
      </Button>
      {creation.status === "error" && (
        <div role="alert" className="max-w-sm">
          <Banner variant="error" title="Could not create session" description={creation.message} />
        </div>
      )}
    </div>
  );
}

function SessionList(): JSX.Element {
  const { host, view } = useAgentHost();

  return (
    <section className="mt-8" aria-labelledby="sessions-heading">
      <LayerCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Text as="h2" variant="heading" id="sessions-heading">
            Sessions for {host}
          </Text>
          <div role="status" className="text-kumo-subtle">
            {view.status === "connected" && `Connected · ${view.sessions.length} sessions`}
            {view.status === "connecting" && "Connecting…"}
            {view.status === "error" && "Disconnected · retrying automatically"}
          </div>
          {view.status === "connected" && (
            <CreateSessionButton createSession={view.createSession} />
          )}
        </div>
        {view.status === "connecting" && (
          <Empty
            icon={<StackIcon size={32} />}
            title="Connecting to host"
            description="Loading sessions…"
          />
        )}
        {view.status === "error" && (
          <div className="mx-6 mb-5" role="alert">
            <Banner variant="error" title="Connection lost" description={view.message} />
          </div>
        )}
        {view.status === "connected" && !view.sessions.length && (
          <Empty
            icon={<StackIcon size={32} />}
            title="No sessions yet"
            description="Create a session to get started. Sessions created on this host will appear here."
          />
        )}
        {view.status === "connected" && Boolean(view.sessions.length) && (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">Current AHP sessions for {host}</caption>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Session</Table.Head>
                  <Table.Head>Provider</Table.Head>
                  <Table.Head>Status</Table.Head>
                  <Table.Head>Workspace</Table.Head>
                  <Table.Head>Updated</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {view.sessions.map((session) => (
                  <Table.Row key={session.resource}>
                    <Table.Cell>
                      <p className="m-0 font-medium">
                        <Link
                          to="/sessions/$sessionId"
                          params={{
                            sessionId: session.resource.slice("ahp-session:/".length),
                          }}
                          search={{ host }}
                          className="text-kumo-link underline underline-offset-4"
                        >
                          {session.title || "Untitled session"}
                        </Link>
                      </p>
                      <code className="text-[0.9em] text-kumo-subtle">{session.resource}</code>
                      {session.activity !== ABSENT && (
                        <p className="mb-0 mt-1 text-kumo-subtle">{session.activity}</p>
                      )}
                    </Table.Cell>
                    <Table.Cell>{session.provider}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <Badge variant="secondary" className="text-sm">
                        {sessionStatus(session.status)}
                      </Badge>
                      {Boolean(session.status & SESSION_STATUS.archived) && (
                        <span className="mt-1 block text-kumo-subtle">Archived</span>
                      )}
                    </Table.Cell>
                    <Table.Cell>{session.workingDirectories?.join(", ") ?? "—"}</Table.Cell>
                    <Table.Cell className="whitespace-nowrap">
                      <time dateTime={session.modifiedAt}>
                        {new Date(session.modifiedAt).toLocaleString()}
                      </time>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </LayerCard>
    </section>
  );
}

export { SessionList };
