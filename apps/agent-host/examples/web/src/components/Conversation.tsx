import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { Badge, Banner, Button } from "@cloudflare/kumo";
import { ArrowUpIcon, RobotIcon, StopIcon, WrenchIcon } from "@phosphor-icons/react";
import type { ActiveTurn, ResponsePart, Turn } from "@experiments/protocol-schemas/ahp";
import type { useAhpSession } from "../hooks/use-ahp-session";

const ABSENT = void 0;

const COMPOSER_MAX_HEIGHT_PX = 160;

const SCROLL_STICK_THRESHOLD_PX = 120;

const NO_TURNS = 0;

const NotificationTextSchema = z.string();

const NotificationMarkdownSchema = z.object({ markdown: z.string() });

function ResponseContent({ part }: { part: ResponsePart }): JSX.Element {
  switch (part.kind) {
    case "markdown": {
      return <p className="m-0 whitespace-pre-wrap leading-relaxed">{part.content}</p>;
    }

    case "reasoning": {
      return (
        <details className="text-sm">
          <summary className="cursor-pointer text-kumo-subtle">Reasoning</summary>
          <p className="mb-0 mt-2 whitespace-pre-wrap text-kumo-subtle">{part.content}</p>
        </details>
      );
    }

    case "error": {
      return <Banner variant="error" title="Agent error" description={part.error.message} />;
    }

    case "toolCall": {
      return (
        <div className="inline-flex w-fit items-center gap-2 rounded-lg bg-kumo-tint px-3 py-1.5 text-sm text-kumo-subtle">
          <WrenchIcon size={14} aria-hidden="true" />
          <span className="font-medium">{part.toolCall.toolName}</span>
          <span aria-hidden="true">·</span>
          <span>{part.toolCall.status}</span>
        </div>
      );
    }

    case "contentRef": {
      return <p className="m-0 text-sm text-kumo-subtle">Resource: {part.uri}</p>;
    }

    case "systemNotification": {
      const text = NotificationTextSchema.safeParse(part.content);

      const content = text.success
        ? text.data
        : NotificationMarkdownSchema.parse(part.content).markdown;

      return <p className="m-0 whitespace-pre-wrap text-sm text-kumo-subtle">{content}</p>;
    }

    case "inputRequest": {
      return (
        <p className="m-0 text-sm text-kumo-subtle">
          The agent requested input. Interactive input is not available in this example.
        </p>
      );
    }

    default: {
      const exhaustive: never = part;
      throw new Error(`Unknown response part: ${String(exhaustive)}`);
    }
  }
}

function UserMessage({ turn }: { turn: Turn | ActiveTurn }): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-kumo-tint px-4 py-2.5">
        <p className="m-0 whitespace-pre-wrap leading-relaxed">{turn.message.text}</p>
      </div>
    </div>
  );
}

function AgentResponse({
  turn,
  streaming,
}: {
  turn: Turn | ActiveTurn;
  streaming: boolean;
}): JSX.Element {
  const thinking = streaming && !turn.responseParts.length;
  const cancelled = "state" in turn && turn.state === "cancelled";

  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden="true"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-kumo-tint text-kumo-subtle"
      >
        <RobotIcon size={16} />
      </div>
      <div className="grid min-w-0 flex-1 gap-2.5">
        <div className="flex items-center gap-2">
          <p className="m-0 text-sm font-medium">Agent</p>
          {streaming && <Badge>Responding…</Badge>}
          {cancelled && <Badge>Cancelled</Badge>}
        </div>
        {thinking ? (
          <p role="status" className="m-0 animate-pulse text-kumo-subtle">
            Agent is thinking…
          </p>
        ) : (
          turn.responseParts.map((part, index) => <ResponseContent key={index} part={part} />)
        )}
      </div>
    </div>
  );
}

function ConversationTurn({
  turn,
  streaming,
}: {
  turn: Turn | ActiveTurn;
  streaming: boolean;
}): JSX.Element {
  return (
    <article className="grid gap-4" aria-label={streaming ? "Active turn" : "Completed turn"}>
      <UserMessage turn={turn} />
      <AgentResponse turn={turn} streaming={streaming} />
    </article>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-kumo-tint text-kumo-subtle"
      >
        <RobotIcon size={24} />
      </div>
      <div className="grid gap-1">
        <p className="m-0 font-medium">Start the conversation</p>
        <p className="m-0 text-sm text-kumo-subtle">
          Send a message and the agent will respond here.
        </p>
      </div>
    </div>
  );
}

function Conversation({ view }: { view: ReturnType<typeof useAhpSession> }): JSX.Element {
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
            <p role="status" className="m-0 text-kumo-subtle">
              Loading conversation…
            </p>
          )}
          {chat.status === "error" && (
            <Banner
              variant="error"
              title="Could not load conversation"
              description={chat.message}
            />
          )}
          {chat.status === "ready" && lifecycle === "failed" && (
            <Banner
              variant="error"
              title="Session creation failed"
              description={
                view.session.status === "ready"
                  ? (view.session.state.creationError?.message ?? "The agent could not start.")
                  : "The agent could not start."
              }
            />
          )}
          {chat.status === "ready" && lifecycle === "creating" && (
            <p role="status" className="m-0 text-kumo-subtle">
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
        className="border-t border-kumo-line bg-kumo-base px-4 py-3 sm:px-6"
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
            className="max-h-40 min-h-10 w-full resize-none rounded-2xl border border-kumo-line bg-kumo-base px-4 py-2.5 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-kumo-focus"
            placeholder="Message the agent…"
            aria-label="Message"
          />
          {activeTurn ? (
            <Button
              variant="secondary"
              type="button"
              icon={StopIcon}
              className="size-10 shrink-0 rounded-full p-0"
              aria-label="Stop response"
              disabled={view.connection !== "connected" || view.command.status === "pending"}
              onClick={() => {
                void cancel();
              }}
            >
              <span className="sr-only">Stop response</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              type="submit"
              icon={ArrowUpIcon}
              className="size-10 shrink-0 rounded-full p-0"
              aria-label="Send message"
              disabled={!canSubmit}
              loading={view.command.status === "pending"}
            >
              <span className="sr-only">Send message</span>
            </Button>
          )}
        </div>
        {formError !== null && (
          <div className="mx-auto mt-2 w-full max-w-3xl" role="alert">
            <Banner variant="error" title="Message failed" description={formError} />
          </div>
        )}
      </form>
    </div>
  );
}

export { Conversation };
