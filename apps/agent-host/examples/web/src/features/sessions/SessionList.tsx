import { useState } from "react";
import type { JSX } from "react";
import { Badge } from "../../components/ui/badge";
import { Card } from "../../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { MagnifyingGlassIcon, StackIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useAgentHost } from "../../lib/hooks/use-agent-host";
import { CreateSessionButton } from "./CreateSessionButton";
import { SESSION_STATUS, sessionStatus, statusMatches } from "./session-status";
import type { StatusFilter } from "./session-status";

const ABSENT = void 0;

const EMPTY_COUNT = 0;

type SortOrder = "newest" | "oldest";

function toStatusFilter(value: string): StatusFilter {
  switch (value) {
    case "inProgress": {
      return "inProgress";
    }

    case "inputNeeded": {
      return "inputNeeded";
    }

    case "idle": {
      return "idle";
    }

    case "error": {
      return "error";
    }

    default: {
      return "all";
    }
  }
}

function toSortOrder(value: string): SortOrder {
  return value === "oldest" ? "oldest" : "newest";
}

function SessionList(): JSX.Element {
  const { host, view } = useAgentHost();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const sessions = view.status === "connected" ? view.sessions : [];
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleSessions = sessions
    .filter((session) => {
      const searchableText = [
        session.title,
        session.resource,
        session.provider,
        session.activity,
        ...(session.workingDirectories ?? []),
      ]
        .filter((value) => value !== ABSENT)
        .join(" ")
        .toLocaleLowerCase();

      return (
        statusMatches(session.status, statusFilter) && searchableText.includes(normalizedQuery)
      );
    })
    .toSorted((left, right) => {
      const difference = new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime();

      return sortOrder === "newest" ? difference : -difference;
    });

  return (
    <section className="mt-8 grid gap-3" aria-labelledby="sessions-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2
            id="sessions-heading"
            className="font-heading text-lg font-semibold tracking-wider uppercase text-foreground"
          >
            Sessions for {host}
          </h2>
          <p className="m-0 text-sm text-muted-foreground">
            {view.status === "connected" && `${view.sessions.length} sessions on this host`}
            {view.status === "connecting" && "Connecting to host…"}
            {view.status === "error" && "Disconnected · retrying automatically"}
          </p>
        </div>
        {view.status === "connected" && <CreateSessionButton createSession={view.createSession} />}
      </div>
      {view.status === "connected" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <InputGroup className="min-w-0 flex-1">
            <InputGroupAddon>
              <MagnifyingGlassIcon size={16} aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search sessions"
              placeholder="Search sessions"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
            />
          </InputGroup>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(toStatusFilter(value));
            }}
          >
            <SelectTrigger aria-label="Filter sessions by status" className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="inProgress">In progress</SelectItem>
              <SelectItem value="inputNeeded">Input needed</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sortOrder}
            onValueChange={(value) => {
              setSortOrder(toSortOrder(value));
            }}
          >
            <SelectTrigger aria-label="Sort sessions" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Last modified</SelectItem>
              <SelectItem value="oldest">Oldest modified</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {view.status === "connecting" && (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StackIcon size={20} />
              </EmptyMedia>
              <EmptyTitle>Connecting to host</EmptyTitle>
              <EmptyDescription>Loading sessions…</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}
      {view.status === "error" && (
        <div role="alert">
          <Alert variant="destructive">
            <AlertTitle>Connection lost</AlertTitle>
            <AlertDescription>{view.message}</AlertDescription>
          </Alert>
        </div>
      )}
      {view.status === "connected" && sessions.length === EMPTY_COUNT && (
        <Card>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StackIcon size={20} />
              </EmptyMedia>
              <EmptyTitle>No sessions yet</EmptyTitle>
              <EmptyDescription>
                Create a session to get started. Sessions created on this host will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      )}
      {view.status === "connected" &&
        sessions.length > EMPTY_COUNT &&
        visibleSessions.length === EMPTY_COUNT && (
          <Card>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MagnifyingGlassIcon size={20} />
                </EmptyMedia>
                <EmptyTitle>No matching sessions</EmptyTitle>
                <EmptyDescription>Try another search or status filter.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        )}
      {view.status === "connected" &&
        visibleSessions.map((session) => (
          <Card key={session.resource} className="p-0!">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
              <StackIcon size={20} className="shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: session.resource.slice("ahp-session:/".length) }}
                  search={{ host }}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {session.title || "Untitled session"}
                </Link>
                <p className="m-0 truncate text-muted-foreground">{session.resource}</p>
              </div>
              <div className="flex items-center gap-3 sm:gap-4">
                <Badge variant="secondary">{sessionStatus(session.status)}</Badge>
                <time
                  className="whitespace-nowrap text-muted-foreground"
                  dateTime={session.modifiedAt}
                >
                  {new Date(session.modifiedAt).toLocaleString()}
                </time>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted px-4 py-2 text-muted-foreground sm:px-5">
              <span>{session.provider}</span>
              {session.workingDirectories !== ABSENT &&
              session.workingDirectories.length > EMPTY_COUNT ? (
                <span className="truncate">{session.workingDirectories.join(", ")}</span>
              ) : null}
              {session.activity !== ABSENT && <span className="truncate">{session.activity}</span>}
              {Boolean(session.status & SESSION_STATUS.archived) && <span>Archived</span>}
            </div>
          </Card>
        ))}
    </section>
  );
}

export { SessionList };
