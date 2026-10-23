import type { ClientEvent } from "@microsoft/agent-host-protocol/client";
import { useState, type ReactElement } from "react";

import type { AhpEventEntry } from "~/lib/ahp/hooks/use-ahp-events";

const JSON_INDENT = 2;
const MILLISECOND_DIGITS = 3;

/** The JSON-RPC method names that AHP uses for channel notifications. */
const NOTIFICATION_METHODS = {
  sessionAdded: "root/sessionAdded",
  sessionRemoved: "root/sessionRemoved",
  sessionSummaryChanged: "root/sessionSummaryChanged",
  authRequired: "auth/required",
} as const;

/** Reads the protocol name of an event. Actions report their action type. */
function eventMethod(event: ClientEvent): string {
  const payload = event.event;

  return payload.type === "action"
    ? payload.params.action.type
    : NOTIFICATION_METHODS[payload.type];
}

/** Reads the local arrival time of an event with millisecond precision. */
function timeText(receivedAt: number): string {
  const time = new Date(receivedAt);
  const milliseconds = String(time.getMilliseconds()).padStart(MILLISECOND_DIGITS, "0");

  return `${time.toLocaleTimeString(undefined, { hour12: false })}.${milliseconds}`;
}

/** Reads the payload of an event as JSON. */
function payloadText(event: ClientEvent): string {
  return JSON.stringify(event.event, undefined, JSON_INDENT);
}

/** Reads the event count as a label. */
function countText(count: number): string {
  return count === 1 ? "1 event" : `${count} events`;
}

type SessionEventRowProps = {
  entry: AhpEventEntry;
};

/**
 * Renders one event as a collapsed row.
 *
 * The payload renders only while the row is expanded, because a streamed chat
 * delta carries a large payload and most rows stay collapsed.
 */
function SessionEventRow({ entry }: SessionEventRowProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="rounded border border-neutral-200">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
        }}
        className="w-full px-3 py-2 text-left hover:bg-stone-100"
      >
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 text-right font-mono text-neutral-500">{entry.sequence}</span>
          <span className="min-w-0 flex-1 truncate font-mono font-semibold">
            {eventMethod(entry.event)}
          </span>
        </span>
        <span className="mt-0.5 flex items-baseline gap-2 font-mono text-xs text-neutral-500">
          <span className="shrink-0">{timeText(entry.receivedAt)}</span>
          <span className="min-w-0 truncate">{entry.event.channel}</span>
        </span>
      </button>
      {expanded ? (
        <pre className="max-h-64 overflow-auto border-t border-neutral-200 px-3 py-2 text-xs whitespace-pre-wrap">
          {payloadText(entry.event)}
        </pre>
      ) : null}
    </li>
  );
}

type SessionEventsListProps = {
  /** The recorded events, most recent first. */
  entries: AhpEventEntry[];
  /** Drops every recorded event. */
  onClear(): void;
};

/** Renders the inbound AHP events of the connection, most recent first. */
export function SessionEventsList({ entries, onClear }: SessionEventsListProps): ReactElement {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 text-neutral-600">
        <p>{entries.length === 0 ? "No events yet." : countText(entries.length)}</p>
        <button
          type="button"
          disabled={entries.length === 0}
          onClick={onClear}
          className="rounded border border-neutral-300 px-3 py-1 text-neutral-700 enabled:hover:bg-stone-200 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-neutral-600">
          Events appear here as the host delivers them to this connection.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {entries.map((entry) => (
            <SessionEventRow key={entry.sequence} entry={entry} />
          ))}
        </ol>
      )}
    </div>
  );
}
