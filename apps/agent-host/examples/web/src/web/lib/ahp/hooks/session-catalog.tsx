import {
  rootReducer,
  type AgentInfo as AHPAgentInfo,
  type RootState as AHPRootState,
  type SessionSummary as AHPSessionSummary,
  type URI as AHPURI,
} from "@microsoft/agent-host-protocol";
import type {
  AhpClient,
  SubscriptionEvent as AHPSubscriptionEvent,
} from "@microsoft/agent-host-protocol/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { errorMessage } from "~/lib/error-message";
import { isRootAction, isRootState } from "../guards";
import { useAhpClient } from "./ahp-context";

/** How many session summaries the catalog requests. */
const PAGE_SIZE = 50;

const ROOT_CHANNEL = "ahp-root://";

/** The status of the session catalog. */
export type AhpSessionsStatus = "loading" | "ready" | "failed";

/** The session catalog of the host, kept in sync with the root channel. */
export type AhpSessionsState = {
  /** Whether the catalog has loaded, is loading, or failed. */
  status: AhpSessionsStatus;
  /** Session summaries, most recently updated first. */
  sessions: AHPSessionSummary[];
  /** The agent backends of the host and the models each one offers. */
  agents: AHPAgentInfo[];
  /** The transport or catalog failure, when there is one. */
  message: string | null;
  /** Whether a session creation is in flight. */
  creating: boolean;
  /** Creates a session and returns its channel URI, or `null` on failure. */
  create(): Promise<AHPURI | null>;
};

/** The callbacks a catalog watcher reports to. */
type CatalogHandlers = {
  onLoaded(items: AHPSessionSummary[]): void;
  onRoot(root: AHPRootState): void;
  onEvent(event: AHPSubscriptionEvent): void;
  onFailed(message: string): void;
};

/** Sorts sessions so the most recently modified one comes first. */
function byMostRecentFirst(a: AHPSessionSummary, b: AHPSessionSummary): number {
  return Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt);
}

/** Replaces a summary, or prepends it when the catalog does not have it. */
function upsertSummary(
  items: AHPSessionSummary[],
  summary: AHPSessionSummary,
): AHPSessionSummary[] {
  const rest = items.filter((item) => item.resource !== summary.resource);

  return [summary, ...rest];
}

/** Merges changed summary fields into the catalog. */
function patchSummary(
  items: AHPSessionSummary[],
  session: AHPURI,
  changes: Partial<AHPSessionSummary>,
): AHPSessionSummary[] {
  return items.map((item) => (item.resource === session ? { ...item, ...changes } : item));
}

/** Applies one root channel event to the catalog. */
function applyCatalogEvent(
  event: AHPSubscriptionEvent,
  update: (items: (previous: AHPSessionSummary[]) => AHPSessionSummary[]) => void,
): void {
  function apply(mutate: (items: AHPSessionSummary[]) => AHPSessionSummary[]): void {
    update((items) => mutate(items).toSorted(byMostRecentFirst));
  }

  if (event.type === "sessionAdded") {
    const { summary } = event.params;

    apply((items) => upsertSummary(items, summary));

    return;
  }

  if (event.type === "sessionSummaryChanged") {
    const { session, changes } = event.params;

    apply((items) => patchSummary(items, session, changes));

    return;
  }

  if (event.type === "sessionRemoved") {
    const { session } = event.params;

    apply((items) => items.filter((item) => item.resource !== session));
  }
}

/** Subscribes to the root channel and reports every catalog change. */
function watchCatalog(client: AhpClient, signal: AbortSignal, handlers: CatalogHandlers): void {
  async function run(): Promise<void> {
    try {
      const listed = await client.request("listSessions", {
        channel: ROOT_CHANNEL,
        limit: PAGE_SIZE,
      });

      handlers.onLoaded(listed.items);

      const subscribed = await client.subscribe(ROOT_CHANNEL);
      const { snapshot } = subscribed.result;
      let root = snapshot !== undefined && isRootState(snapshot.state) ? snapshot.state : undefined;

      if (root !== undefined) {
        handlers.onRoot(root);
      }

      for await (const event of subscribed.subscription) {
        if (signal.aborted) {
          break;
        }

        if (event.type === "action" && root !== undefined && isRootAction(event.params.action)) {
          root = rootReducer(root, event.params.action);
          handlers.onRoot(root);
        } else {
          handlers.onEvent(event);
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        handlers.onFailed(errorMessage(error));
      }
    }
  }

  void run();
}

const SessionCatalogContext = createContext<AhpSessionsState | undefined>(undefined);

type SessionCatalogProviderProps = {
  children: ReactNode;
};

/**
 * Reads the host's session catalog once for the whole app.
 *
 * The catalog comes from `listSessions` and is then maintained by the
 * `root/sessionAdded`, `root/sessionSummaryChanged`, and `root/sessionRemoved`
 * notifications. Sessions are sorted by `modifiedAt` descending, so the most
 * recently updated session is always first. The same subscription keeps the
 * agent catalog, which carries the models that each agent offers.
 *
 * One provider owns the root channel subscription, because unsubscribing drops
 * the channel for every consumer of the client.
 */
export function SessionCatalogProvider({ children }: SessionCatalogProviderProps): ReactElement {
  const client = useAhpClient();
  const [sessions, setSessions] = useState<AHPSessionSummary[]>([]);
  const [agents, setAgents] = useState<AHPAgentInfo[]>([]);
  const [status, setStatus] = useState<AhpSessionsStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (client === undefined) {
      return;
    }

    setStatus("loading");
    setMessage(null);

    const controller = new AbortController();

    const handlers: CatalogHandlers = {
      onLoaded: (items): void => {
        setSessions(items.toSorted(byMostRecentFirst));
        setStatus("ready");
      },
      onRoot: (root): void => {
        setAgents(root.agents);
      },
      onEvent: (event): void => {
        applyCatalogEvent(event, setSessions);
      },
      onFailed: (reason): void => {
        setMessage(reason);
        setStatus("failed");
      },
    };

    watchCatalog(client, controller.signal, handlers);

    return (): void => {
      controller.abort();
      void client.unsubscribe(ROOT_CHANNEL);
    };
  }, [client]);

  const create = useCallback(async (): Promise<AHPURI | null> => {
    if (client === undefined) {
      return null;
    }

    const created = `ahp-session:/${crypto.randomUUID()}`;

    setCreating(true);

    try {
      await client.request("createSession", { channel: created });

      return created;
    } catch (error) {
      setMessage(errorMessage(error));

      return null;
    } finally {
      setCreating(false);
    }
  }, [client]);

  return (
    <SessionCatalogContext.Provider value={{ status, sessions, agents, message, creating, create }}>
      {children}
    </SessionCatalogContext.Provider>
  );
}

/** Reads the session catalog of the host. */
export function useAhpSessions(): AhpSessionsState {
  const state = useContext(SessionCatalogContext);

  if (state === undefined) {
    throw new Error("useAhpSessions must be used inside SessionCatalogProvider");
  }

  return state;
}
