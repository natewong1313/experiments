import type {
  AgentInfo as AHPAgentInfo,
  SessionModelInfo as AHPSessionModelInfo,
} from "@microsoft/agent-host-protocol";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactElement } from "react";

import { ChatComposer } from "~/components/chat/chat-composer";
import { ChatConversation } from "~/components/chat/chat-conversation";
import { useAhpClient } from "~/lib/ahp/hooks/ahp-context";
import { useAhpChat } from "~/lib/ahp/hooks/use-ahp-chat";
import { useAhpSession } from "~/lib/ahp/hooks/use-ahp-session";
import { useAhpSessions } from "~/lib/ahp/hooks/session-catalog";
import { SessionObjectsPanel } from "~/components/sessions/session-objects-panel";
import { getSessionObjects } from "~/lib/session-objects";

export const Route = createFileRoute("/sessions/$sessionId")({
  loader: ({ params }) => getSessionObjects({ data: { sessionId: params.sessionId } }),
  component: SessionComponent,
});

function SessionComponent(): ReactElement {
  const { sessionId } = Route.useParams();
  const initialObjects = Route.useLoaderData();
  const [objectsOpen, setObjectsOpen] = useState(true);
  const client = useAhpClient();
  const catalog = useAhpSessions();
  const sessionUri = `ahp-session:/${sessionId}`;
  const session = useAhpSession(client, sessionUri);
  const chat = session.status === "ready" ? session.chat : undefined;
  const controller = useAhpChat(client, chat);

  const failure = firstFailure(session, controller.error);
  const title = session.status === "ready" ? session.session.title : "Session";
  const provider = session.status === "ready" ? session.session.provider : undefined;
  const models = offeredModels(catalog.agents, provider);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-4 border-b border-neutral-200 px-6 py-2 text-sm">
          <h1 className="min-w-0 truncate font-semibold">{title}</h1>
          <div className="flex shrink-0 items-center gap-2 text-sm text-neutral-600">
            {session.status === "ready" ? <span>{session.session.lifecycle}</span> : null}
          </div>
          <button
            type="button"
            aria-expanded={objectsOpen}
            aria-controls="session-objects"
            onClick={() => {
              setObjectsOpen(!objectsOpen);
            }}
            className="ml-auto shrink-0 rounded border border-neutral-300 px-3 py-1 hover:bg-stone-200"
          >
            {objectsOpen ? "Hide Debug" : "Debug"}
          </button>
        </div>

        {failure === null ? null : (
          <p className="shrink-0 px-6 pt-4 text-sm text-red-600">Session unavailable: {failure}</p>
        )}

        <ChatConversation
          state={controller.state}
          phase={controller.phase}
          onConfirmToolCall={controller.confirmToolCall}
          onConfirmToolResult={controller.confirmToolResult}
        />

        <div className="shrink-0 border-t border-neutral-200 px-6 py-4">
          <ChatComposer
            phase={controller.phase}
            models={models}
            model={controller.model}
            onSend={controller.send}
            onStop={controller.stop}
          />
        </div>
      </div>
      {objectsOpen ? (
        <div id="session-objects" className="flex min-h-0 shrink-0 flex-col">
          <SessionObjectsPanel key={sessionId} sessionId={sessionId} initial={initialObjects} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Returns the models of the agent that runs the session. Before the agent
 * catalog or the session provider is known, no model is offered.
 */
function offeredModels(
  agents: AHPAgentInfo[],
  provider: string | undefined,
): AHPSessionModelInfo[] {
  return agents.find((agent) => agent.provider === provider)?.models ?? [];
}

/** Returns the first failure reported by the session or the chat. */
function firstFailure(
  session: ReturnType<typeof useAhpSession>,
  chat: string | null,
): string | null {
  return session.status === "failed" ? session.message : chat;
}
