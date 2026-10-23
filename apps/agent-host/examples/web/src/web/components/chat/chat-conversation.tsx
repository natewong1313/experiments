import type { ChatState as AHPChatState } from "@microsoft/agent-host-protocol";
import { useEffect, useLayoutEffect, useRef, type ReactElement } from "react";

import type { AhpChatPhase } from "~/lib/ahp/chat-phase";

import { ChatTurn } from "./chat-turn";

/** Distance from the bottom, in pixels, that still counts as following the stream. */
const FOLLOW_THRESHOLD_PX = 32;

/**
 * Scroll synchronization must run before the browser paints.
 *
 * Server rendering has no layout to measure, so it uses `useEffect`, which does
 * nothing there, instead of triggering the `useLayoutEffect` warning.
 */
const usePaintEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type ChatConversationProps = {
  state: AHPChatState | undefined;
  /** The interaction phase of the chat, which the active turn shows. */
  phase: AhpChatPhase;
  onConfirmToolCall(turnId: string, toolCallId: string, approved: boolean): void;
  onConfirmToolResult(turnId: string, toolCallId: string, approved: boolean): void;
};

/**
 * Renders a chat's turns in its own scroll container.
 *
 * The list follows new content only while the viewport is at the bottom. A new
 * turn restores the follow state, so a sent message and its reply always enter
 * view; scrolling up pauses the follow state until the user returns to the
 * bottom. Setting the scroll offset directly keeps the view attached to the
 * streaming tail without an animation that would restart on every update.
 */
export function ChatConversation({
  state,
  phase,
  onConfirmToolCall,
  onConfirmToolResult,
}: ChatConversationProps): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const turns = state?.turns ?? [];
  const active = state?.activeTurn;
  const count = turns.length + (active === undefined ? 0 : 1);
  const previousCount = useRef(count);

  usePaintEffect((): void => {
    if (count > previousCount.current) {
      following.current = true;
    }

    previousCount.current = count;

    const node = scroller.current;

    if (node === null || !following.current) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [state, count]);

  function trackFollow(): void {
    const node = scroller.current;

    if (node === null) {
      return;
    }

    following.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <= FOLLOW_THRESHOLD_PX;
  }

  return (
    <div
      ref={scroller}
      onScroll={trackFollow}
      className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-6 py-4"
    >
      {count === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
          No messages yet. Send a message to start the conversation.
        </div>
      ) : (
        <div className="grid min-w-0 gap-6">
          {turns.map((turn) => (
            <ChatTurn
              key={turn.id}
              turn={turn}
              phase="idle"
              onConfirmToolCall={onConfirmToolCall}
              onConfirmToolResult={onConfirmToolResult}
            />
          ))}
          {active === undefined ? null : (
            <ChatTurn
              key={active.id}
              turn={active}
              phase={phase}
              onConfirmToolCall={onConfirmToolCall}
              onConfirmToolResult={onConfirmToolResult}
            />
          )}
        </div>
      )}
    </div>
  );
}
