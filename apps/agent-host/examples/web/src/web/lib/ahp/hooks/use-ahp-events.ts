import type { AhpClient, ClientEvent } from "@microsoft/agent-host-protocol/client";
import { useCallback, useEffect, useState } from "react";

/** The number of events the stream keeps. A streamed chat reply emits one delta per chunk. */
const EVENT_LIMIT = 200;

/** One inbound event, tagged with its arrival order and time. */
export type AhpEventEntry = {
  /** The arrival order within the mounted stream, starting at one. */
  sequence: number;
  /** The local arrival time in milliseconds since the epoch. */
  receivedAt: number;
  /** The event, tagged with the channel it belongs to. */
  event: ClientEvent;
};

/** The inbound event stream of an AHP client. */
export type AhpEventsState = {
  /** The most recent events first, with at most {@link EVENT_LIMIT} entries. */
  entries: AhpEventEntry[];
  /** Drops every recorded entry. */
  clear(): void;
};

/**
 * Records the inbound events of every channel of an AHP client.
 *
 * The client fans every inbound notification out to its `events()` stream, so
 * the stream also carries channel notifications that no subscription consumes.
 * The stream starts empty, because it does not replay events that arrived
 * before the hook mounted.
 *
 * @param client - A connected AHP client, or `undefined` while connecting.
 */
export function useAhpEvents(client: AhpClient | undefined): AhpEventsState {
  const [entries, setEntries] = useState<AhpEventEntry[]>([]);

  useEffect(() => {
    if (client === undefined) {
      return;
    }

    // A new client starts a new recording, so the sequence starts at one.
    setEntries([]);

    let sequence = 0;
    const stream = client.events();

    async function record(): Promise<void> {
      for await (const event of stream) {
        sequence += 1;

        const entry: AhpEventEntry = { sequence, receivedAt: Date.now(), event };

        setEntries((previous) => [entry, ...previous].slice(0, EVENT_LIMIT));
      }
    }

    void record();

    return (): void => {
      void stream.return?.();
    };
  }, [client]);

  const clear = useCallback((): void => {
    setEntries([]);
  }, []);

  return { entries, clear };
}
