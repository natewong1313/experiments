import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { Button } from "../../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { ArrowUpIcon, SpinnerGapIcon, StopIcon } from "@phosphor-icons/react";
import type { useAhpSession } from "../../lib/hooks/use-ahp-session";
import { ConversationTurn } from "./ConversationTurn";
import { EmptyState } from "./EmptyState";

const ABSENT = void 0;

const COMPOSER_MAX_HEIGHT_PX = 160;

const SCROLL_STICK_THRESHOLD_PX = 120;

const NO_TURNS = 0;

type ConversationParams = { view: ReturnType<typeof useAhpSession> };

function Conversation({ view }: ConversationParams): JSX.Element {
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const { chat, session } = view;

  const lifecycle = session.status === "ready" ? session.state.lifecycle : ABSENT;

  const activeTurn = chat.status === "ready" ? chat.state.activeTurn : ABSENT;

  const turnCount = chat.status === "ready" ? chat.state.turns.length : NO_TURNS;

  const activePartCount = activeTurn === ABSENT ? NO_TURNS : activeTurn.responseParts.length;

  useEffect(() => {
    const transcript = transcriptRef.current;

    if (transcript && stickToBottomRef.current) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [chat.status, turnCount, activePartCount]);

  function handleScroll(): void {
    const transcript = transcriptRef.current;

    if (transcript) {
      const distance = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;

      stickToBottomRef.current = distance < SCROLL_STICK_THRESHOLD_PX;
    }
  }

  async function send(): Promise<void> {
    setFormError(null);

    try {
      await view.sendMessage(draft);
      setDraft("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  async function cancel(): Promise<void> {
    setFormError(null);

    try {
      await view.cancelTurn();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  const canSubmit = view.canSend && draft.trim() !== "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={transcriptRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          {chat.status === "loading" && (
            <p role="status" className="m-0 text-muted-foreground">
              Loading conversation…
            </p>
          )}
          {chat.status === "error" && (
            <Alert variant="destructive">
              <AlertTitle>Could not load conversation</AlertTitle>
              <AlertDescription>{chat.message}</AlertDescription>
            </Alert>
          )}
          {chat.status === "ready" && lifecycle === "failed" && (
            <Alert variant="destructive">
              <AlertTitle>Session creation failed</AlertTitle>
              <AlertDescription>
                {view.session.status === "ready"
                  ? (view.session.state.creationError?.message ?? "The agent could not start.")
                  : "The agent could not start."}
              </AlertDescription>
            </Alert>
          )}
          {chat.status === "ready" && lifecycle === "creating" && (
            <p role="status" className="m-0 text-muted-foreground">
              The agent is starting. You can send a message once it is ready.
            </p>
          )}
          {chat.status === "ready" &&
            turnCount === NO_TURNS &&
            activeTurn === ABSENT &&
            lifecycle === "ready" && <EmptyState />}
          {chat.status === "ready" &&
            chat.state.turns.map((turn) => (
              <ConversationTurn key={turn.id} turn={turn} streaming={false} />
            ))}
          {chat.status === "ready" && activeTurn && (
            <ConversationTurn turn={activeTurn} streaming />
          )}
        </div>
      </div>
      <form
        className="border-t border-border bg-background px-4 py-3 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <textarea
            id="message"
            name="message"
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              const field = event.target;

              field.style.height = "auto";
              field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                if (canSubmit) {
                  void send();
                }
              }
            }}
            className="max-h-40 min-h-10 w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ring"
            placeholder="Message the agent…"
            aria-label="Message"
          />
          {activeTurn ? (
            <Button
              variant="secondary"
              type="button"
              size="icon"
              className="size-10 shrink-0 rounded-full!"
              aria-label="Stop response"
              disabled={view.connection !== "connected" || view.command.status === "pending"}
              onClick={() => {
                void cancel();
              }}
            >
              <StopIcon />
              <span className="sr-only">Stop response</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-full!"
              aria-label="Send message"
              disabled={!canSubmit}
            >
              {view.command.status === "pending" ? (
                <SpinnerGapIcon className="animate-spin" />
              ) : (
                <ArrowUpIcon />
              )}
              <span className="sr-only">Send message</span>
            </Button>
          )}
        </div>
        {formError !== null && (
          <div className="mx-auto mt-2 w-full max-w-3xl" role="alert">
            <Alert variant="destructive">
              <AlertTitle>Message failed</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          </div>
        )}
      </form>
    </div>
  );
}

export { Conversation };
