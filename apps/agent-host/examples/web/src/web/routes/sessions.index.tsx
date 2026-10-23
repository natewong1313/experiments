import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { SessionTable } from "~/components/sessions/session-table";
import { sessionIdOf } from "~/lib/ahp/helpers";
import { useAhpSessions } from "~/lib/ahp/hooks/session-catalog";

export const Route = createFileRoute("/sessions/")({
  component: SessionsComponent,
});

function SessionsComponent(): ReactElement {
  const sessions = useAhpSessions();
  const navigate = useNavigate();

  async function createSession(): Promise<void> {
    const created = await sessions.create();

    if (created === null) {
      return;
    }

    await navigate({ to: "/sessions/$sessionId", params: { sessionId: sessionIdOf(created) } });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-16 py-8">
      <button
        type="button"
        disabled={sessions.creating}
        onClick={(): void => {
          void createSession();
        }}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm enabled:hover:bg-stone-200 disabled:opacity-50"
      >
        New session
      </button>
      <div className="mx-auto mt-6">
        <SessionTable sessions={sessions.sessions} loading={sessions.status === "loading"} />
      </div>
    </div>
  );
}
