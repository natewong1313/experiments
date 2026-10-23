import { useEffect, useState, type ReactElement } from "react";

import type { SessionObject, SessionObjectKind } from "../../../host/session-objects";
import { SessionEventsList } from "./session-events-list";
import { useAhpClient } from "~/lib/ahp/hooks/ahp-context";
import { useAhpEvents } from "~/lib/ahp/hooks/use-ahp-events";
import { errorMessage } from "~/lib/error-message";
import { evictObject, getSessionObjects, type SessionObjectsResult } from "~/lib/session-objects";

const REFRESH_INTERVAL_MS = 500;

const OBJECT_LABELS: Record<SessionObjectKind, string> = {
  root: "Host",
  session: "Session",
  router: "Connection router",
};

/** The debug views that the panel switches between. */
const DEBUG_VIEWS = [
  { id: "objects", label: "DOs" },
  { id: "events", label: "Events" },
] as const;

type DebugView = (typeof DEBUG_VIEWS)[number]["id"];

/** A tab that is not selected leaves the tab order. */
const UNREACHABLE_TAB_INDEX = -1;

/** Returns the tab element ID of a debug view. */
function tabId(view: DebugView): string {
  return `debug-tab-${view}`;
}

/** Returns the tab panel element ID of a debug view. */
function panelId(view: DebugView): string {
  return `debug-panel-${view}`;
}

/** Returns the debug view that is not the given one. */
function otherView(view: DebugView): DebugView {
  return view === "objects" ? "events" : "objects";
}

type DebugTabsProps = {
  active: DebugView;
  onChange(view: DebugView): void;
};

/** Renders the view switcher with tab semantics and arrow key navigation. */
function DebugTabs({ active, onChange }: DebugTabsProps): ReactElement {
  return (
    <div role="tablist" aria-label="Debug views" className="flex gap-2">
      {DEBUG_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          role="tab"
          id={tabId(view.id)}
          aria-selected={active === view.id}
          aria-controls={panelId(view.id)}
          tabIndex={active === view.id ? 0 : UNREACHABLE_TAB_INDEX}
          onClick={() => {
            onChange(view.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              onChange(otherView(view.id));
            }
          }}
          className="rounded border border-neutral-300 px-3 py-1 hover:bg-stone-200 aria-selected:bg-stone-200 aria-selected:font-semibold"
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

type SessionObjectCardProps = {
  object: SessionObject;
  /** The ID of the object that is being evicted, when one is. */
  evicting: string | undefined;
  onEvict(object: SessionObject): void;
  onCopyId(id: string): void;
};

/** Renders one Durable Object with its channels and its actions. */
function SessionObjectCard({
  object,
  evicting,
  onEvict,
  onCopyId,
}: SessionObjectCardProps): ReactElement {
  return (
    <li className="rounded border border-neutral-200 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{OBJECT_LABELS[object.kind]}</h3>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              onCopyId(object.id);
            }}
            className="rounded border border-neutral-300 px-3 py-1 hover:bg-stone-200"
          >
            Copy ID
          </button>
          <button
            type="button"
            disabled={evicting !== undefined}
            onClick={() => {
              onEvict(object);
            }}
            aria-label={`Evict ${object.kind} ${object.name}`}
            className="rounded border border-red-300 px-3 py-1 text-red-700 enabled:hover:bg-red-50 disabled:opacity-50"
          >
            {evicting === object.id ? "Evicting…" : "Evict"}
          </button>
        </div>
      </div>
      <dl className="mt-3 space-y-1">
        <dt className="text-neutral-600">Name</dt>
        <dd className="break-all font-mono">{object.name}</dd>
      </dl>
      {object.channels.length === 0 ? null : (
        <div className="mt-3">
          <h4 className="text-neutral-600">Subscribed channels</h4>
          <ul className="mt-1 space-y-1 font-mono">
            {object.channels.map((channel) => (
              <li key={channel} className="break-all">
                {channel}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

type ObjectsViewProps = {
  result: SessionObjectsResult;
  evicting: string | undefined;
  onEvict(object: SessionObject): void;
  onCopyId(id: string): void;
};

/** Renders the Durable Objects of the session, or the reason they are unknown. */
function ObjectsView({ result, evicting, onEvict, onCopyId }: ObjectsViewProps): ReactElement {
  if (result.status === "failed") {
    return (
      <p role="alert" className="mt-3 text-red-600">
        Could not inspect objects: {result.message}
      </p>
    );
  }

  const { objects } = result.snapshot;

  return (
    <>
      <ul className="mt-4 space-y-4">
        {objects.map((object) => (
          <SessionObjectCard
            key={object.id}
            object={object}
            evicting={evicting}
            onEvict={onEvict}
            onCopyId={onCopyId}
          />
        ))}
      </ul>
      {objects.some((object) => object.kind === "router") ? null : (
        <p className="mt-4 text-neutral-600">No recorded router subscriptions.</p>
      )}
    </>
  );
}

type SessionObjectsPanelProps = {
  sessionId: string;
  initial: SessionObjectsResult;
};

/**
 * Renders the debug panel of a session.
 *
 * The panel switches between the Durable Objects of the session and the event
 * stream of the AHP connection. The event stream records while either view is
 * open, so the events view keeps the events that arrive during inspection.
 */
export function SessionObjectsPanel({
  sessionId,
  initial,
}: SessionObjectsPanelProps): ReactElement {
  const client = useAhpClient();
  const events = useAhpEvents(client);
  const [view, setView] = useState<DebugView>("objects");
  const [result, setResult] = useState(initial);
  const [refreshKey, setRefreshKey] = useState(0);
  const [evicting, setEvicting] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function poll(): Promise<void> {
      try {
        const next = await getSessionObjects({ data: { sessionId }, signal: controller.signal });
        if (!controller.signal.aborted) {
          setResult(next);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({ status: "failed", message: errorMessage(error) });
        }
      } finally {
        if (!controller.signal.aborted) {
          timer = setTimeout(() => void poll(), REFRESH_INTERVAL_MS);
        }
      }
    }

    void poll();

    return (): void => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sessionId, refreshKey]);

  async function evict(object: SessionObject): Promise<void> {
    setEvicting(object.id);
    setNotice(undefined);

    try {
      await evictObject({ data: { sessionId, kind: object.kind, name: object.name } });
      setNotice(`${OBJECT_LABELS[object.kind]} evicted. Its next event can restart it.`);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setNotice(`Eviction failed: ${errorMessage(error)}`);
    } finally {
      setEvicting(undefined);
    }
  }

  async function copyId(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      setNotice("Object ID copied.");
    } catch (error) {
      setNotice(`Could not copy ID: ${errorMessage(error)}`);
    }
  }

  return (
    <aside
      aria-label="Debug panel"
      className="max-h-[45dvh] min-h-0 overflow-y-auto border-t border-neutral-200 bg-stone-50 text-sm lg:max-h-none lg:w-96 lg:flex-1 lg:border-t-0 lg:border-l"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-2">
        <h2 className="font-semibold">Debug Panel</h2>
        <DebugTabs active={view} onChange={setView} />
      </div>
      <div className="px-5 pb-5">
        <p role="status" className="mt-3 break-words">
          {notice}
        </p>
        <div
          role="tabpanel"
          id={panelId("objects")}
          aria-labelledby={tabId("objects")}
          hidden={view !== "objects"}
        >
          <ObjectsView
            result={result}
            evicting={evicting}
            onEvict={(object) => {
              void evict(object);
            }}
            onCopyId={(id) => {
              void copyId(id);
            }}
          />
        </div>
        <div
          role="tabpanel"
          id={panelId("events")}
          aria-labelledby={tabId("events")}
          hidden={view !== "events"}
        >
          <SessionEventsList entries={events.entries} onClear={events.clear} />
        </div>
      </div>
    </aside>
  );
}
