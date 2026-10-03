import { useEffect, useState } from "react";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import type { ListSessionsParams, SessionSummary } from "@microsoft/agent-host-protocol";
import type { SubscriptionEvent } from "@microsoft/agent-host-protocol/client";
import { AhpClient } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";

const ABSENT = void 0;

const ROOT_CHANNEL = "ahp-root://";

const RECONNECT_DELAY_MS = 3000;

type CreateSession = () => Promise<void>;

type SessionView =
  | { status: "connecting" }
  | {
      status: "connected";
      sessions: SessionSummary[];
      client: AhpClient;
      clientId: string;
      createSession: CreateSession;
    }
  | { status: "error"; message: string };

type SessionCatalog = Map<string, SessionSummary>;

async function loadSessions(
  client: AhpClient,
  signal: AbortSignal,
  sessions: SessionCatalog = new Map(),
  cursor?: string,
): Promise<SessionCatalog> {
  const params: ListSessionsParams = { channel: ROOT_CHANNEL };

  if (cursor !== ABSENT) {
    params.cursor = cursor;
  }

  const page = await client.request("listSessions", params);

  for (const summary of page.items) {
    sessions.set(summary.resource, summary);
  }

  if (page.nextCursor === ABSENT || signal.aborted) {
    return sessions;
  }

  return await loadSessions(client, signal, sessions, page.nextCursor);
}

function applySessionEvent(sessions: SessionCatalog, event: SubscriptionEvent): void {
  switch (event.type) {
    case "sessionAdded": {
      sessions.set(event.params.summary.resource, event.params.summary);
      break;
    }

    case "sessionRemoved": {
      sessions.delete(event.params.session);
      break;
    }

    case "sessionSummaryChanged": {
      const summary = sessions.get(event.params.session);

      if (summary) {
        sessions.set(summary.resource, { ...summary, ...event.params.changes });
      }

      break;
    }

    case "action":
    case "authRequired": {
      break;
    }

    default: {
      const exhaustive: never = event;
      throw new Error(`Unknown session event: ${String(exhaustive)}`);
    }
  }
}

function useSessions(host: string): SessionView {
  const [view, setView] = useState<SessionView>({ status: "connecting" });

  useEffect(() => {
    const lifetime = new AbortController();

    function isActive(): boolean {
      return !lifetime.signal.aborted;
    }

    let client: AhpClient | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function connect(): Promise<void> {
      setView({ status: "connecting" });
      const endpoint = new URL(`/hosts/${host}/ahp`, window.location.href);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      let connection: AhpClient | undefined;

      try {
        const transport = await WebSocketTransport.connect(endpoint);

        if (!isActive()) {
          await transport.close();

          return;
        }

        connection = new AhpClient(transport);
        client = connection;
        const clientId = crypto.randomUUID();
        const events = connection.events();
        connection.connect();
        await connection.initialize({
          clientId,
          protocolVersions: [PROTOCOL_VERSION],
          initialSubscriptions: [ROOT_CHANNEL],
        });

        const sessions = await loadSessions(connection, lifetime.signal);
        const connectedClient = connection;

        async function createSession(): Promise<void> {
          await connectedClient.request("createSession", {
            channel: `ahp-session:/${crypto.randomUUID()}`,
            provider: "pi",
          });
        }

        function publish(): void {
          if (isActive()) {
            setView({
              status: "connected",
              createSession,
              client: connectedClient,
              clientId,
              sessions: [...sessions.values()].toSorted((left, right) =>
                right.modifiedAt.localeCompare(left.modifiedAt),
              ),
            });
          }
        }

        publish();

        for await (const { channel, event } of events) {
          if (!isActive()) {
            return;
          }

          if (channel !== ROOT_CHANNEL) {
            continue;
          }

          applySessionEvent(sessions, event);

          publish();
        }

        throw new Error("Connection closed. Reconnecting…");
      } catch (error) {
        if (isActive()) {
          setView({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        await connection?.shutdown();

        if (isActive()) {
          retry = setTimeout(() => {
            void connect();
          }, RECONNECT_DELAY_MS);
        }
      }
    }

    void connect();

    return (): void => {
      lifetime.abort();
      clearTimeout(retry);
      void client?.shutdown();
    };
  }, [host]);

  return view;
}

export { useSessions };

export type { CreateSession };
