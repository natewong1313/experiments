import type { SessionModelInfo as AHPSessionModelInfo } from "@microsoft/agent-host-protocol";
import { useState, type KeyboardEvent, type ReactElement } from "react";

import type { AhpChatPhase } from "~/lib/ahp/chat-phase";

type ChatComposerProps = {
  phase: AhpChatPhase;
  /** The models that the agent of the session offers. */
  models: AHPSessionModelInfo[];
  /** The model that the session runs, when a turn has already chosen one. */
  model: string | undefined;
  onSend(text: string, modelId: string | undefined): void;
  onStop(): void;
};

/**
 * Renders the message input of a chat.
 *
 * The composer owns only the draft text and the pending model choice. It hands
 * a finished message to the caller, which dispatches the AHP action that starts
 * the turn. The selector shows the model of the session until the user picks
 * another one, so a reload shows the model that the last turn ran.
 */
export function ChatComposer({
  phase,
  models,
  model,
  onSend,
  onStop,
}: ChatComposerProps): ReactElement {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<string>();
  const busy = phase === "streaming" || phase === "waiting";
  // Only a known model is sent, so a send before the chat state loads keeps the session model.
  // The selector previews the first model, which is the model of a new session.
  const selected = choice ?? model;
  const shown = selected ?? models.at(0)?.id;

  function submit(): void {
    const message = text.trim();

    if (message.length === 0 || busy) {
      return;
    }

    onSend(message, selected);
    setText("");
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-300 p-3">
      <textarea
        aria-label="Message"
        placeholder="Ask the agent something"
        className="min-h-16 resize-none p-2 text-sm outline-none"
        value={text}
        onChange={(event): void => {
          setText(event.target.value);
        }}
        onKeyDown={keyDown}
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-neutral-500">
          <select
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900"
            value={shown ?? ""}
            disabled={models.length === 0}
            onChange={(event): void => {
              setChoice(event.target.value);
            }}
          >
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        {busy ? (
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            disabled={text.trim().length === 0}
            onClick={submit}
            className="rounded border border-neutral-300 px-3 py-1 text-sm enabled:hover:bg-stone-200 disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
