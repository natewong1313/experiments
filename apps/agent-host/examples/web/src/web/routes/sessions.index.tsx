import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ReactElement } from "react";

import { SessionTable } from "~/components/sessions/session-table";
import { sessionIdOf } from "~/lib/ahp/helpers";
import { useAhpSessions } from "~/lib/ahp/hooks/session-catalog";

export const Route = createFileRoute("/sessions/")({
  component: SessionsComponent,
});

function SessionsComponent(): ReactElement {
  const sessions = useAhpSessions();
  const navigate = useNavigate();
  const [provider, setProvider] = useState("pi");

  async function createSession(): Promise<void> {
    const created = await sessions.create(provider);

    if (created === null) {
      return;
    }

    await navigate({ to: "/sessions/$sessionId", params: { sessionId: sessionIdOf(created) } });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-16 py-8">
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Agent
          <select
            value={provider}
            onChange={(event): void => {
              setProvider(event.target.value);
            }}
            disabled={sessions.creating || sessions.status !== "ready"}
            className="rounded border border-neutral-300 px-3 py-1.5"
          >
            {sessions.agents.map((agent) => (
              <option key={agent.provider} value={agent.provider}>
                {agent.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={sessions.creating || sessions.status !== "ready"}
          onClick={(): void => {
            void createSession();
          }}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm enabled:hover:bg-stone-200 disabled:opacity-50"
        >
          New session
        </button>
      </div>
      {sessions.message === null ? null : (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {sessions.message}
        </p>
      )}
      <div className="mx-auto mt-6">
        <SessionTable sessions={sessions.sessions} loading={sessions.status === "loading"} />
      </div>
    </div>
  );
}
