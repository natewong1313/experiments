import { Link } from "@tanstack/react-router";
import type { SessionSummary as AHPSessionSummary } from "@microsoft/agent-host-protocol";
import type { ReactElement } from "react";

import { sessionIdOf } from "~/lib/ahp/helpers";
import { sessionPhase } from "~/lib/ahp/session-phase";

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** How much of a session identifier the table shows. */
const SHORT_ID_LENGTH = 8;

type SessionTableProps = {
  sessions: AHPSessionSummary[];
  loading: boolean;
};

/** Formats a session timestamp for the table. */
function timestamp(value: string): string {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? value : TIMESTAMP_FORMAT.format(parsed);
}

/**
 * Renders the host's session catalog.
 *
 * Each row links to the session's own page, which owns the conversation.
 */
export function SessionTable({ sessions, loading }: SessionTableProps): ReactElement {
  if (loading) {
    return <p className="text-sm text-neutral-500">Loading sessions…</p>;
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No sessions yet. Create a session to start a conversation with the agent.
      </p>
    );
  }

  return (
    <table className="text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-neutral-500">
          <th className="py-2 pr-4 font-medium">Session</th>
          <th className="py-2 pr-4 font-medium">ID</th>
          <th className="py-2 pr-4 font-medium">Provider</th>
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 pr-4 font-medium">Updated</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <tr key={session.resource} className="border-b border-neutral-100">
            <td className="py-2 pr-4">
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: sessionIdOf(session.resource) }}
                className="text-blue-600 hover:underline"
              >
                {session.title}
              </Link>
            </td>
            <td className="py-2 pr-4 font-mono text-neutral-500">
              {sessionIdOf(session.resource).slice(0, SHORT_ID_LENGTH)}
            </td>
            <td className="py-2 pr-4 text-neutral-600">{session.provider}</td>
            <td className="py-2 pr-4 text-neutral-600">
              {sessionPhase(session.status) === "error" && (
                <span className="bg-red-800 text-white px-2">error</span>
              )}
              {sessionPhase(session.status) === "waiting" && (
                <span className="bg-cyan-600 text-white px-2">input needed!</span>
              )}
              {sessionPhase(session.status) === "idle" && <span className="px-2">idle</span>}
              {sessionPhase(session.status) === "busy" && (
                <span className="px-2 bg-amber-400 text-white">in progress</span>
              )}
            </td>
            <td className="py-2 pr-4 text-neutral-500">{timestamp(session.modifiedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
