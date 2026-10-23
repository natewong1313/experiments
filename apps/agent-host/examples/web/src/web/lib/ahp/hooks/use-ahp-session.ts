import {
  sessionReducer as AHPsessionReducer,
  type SessionState as AHPSessionState,
  type URI as AHPURI,
} from "@microsoft/agent-host-protocol";
import type { AhpClient } from "@microsoft/agent-host-protocol/client";
import { useEffect, useState } from "react";

import { errorMessage } from "~/lib/error-message";
import { isSessionAction, isSessionState } from "../guards";

/** The state of one session channel. */
export type AhpSessionState =
  | { status: "loading" }
  | { status: "ready"; session: AHPSessionState; chat: AHPURI }
  | { status: "failed"; message: string };

/**
 * Subscribes to one session channel and keeps its reduced state in sync.
 *
 * The chat URI comes from `SessionState.defaultChat`, which a host may change
 * over the session's lifetime, so the hook republishes on every session action.
 *
 * @param client - A connected AHP client, or `undefined` while connecting.
 * @param session - The session channel URI, or `undefined` when there is none.
 */
export function useAhpSession(
  client: AhpClient | undefined,
  session: AHPURI | undefined,
): AhpSessionState {
  const [state, setState] = useState<AhpSessionState>({ status: "loading" });

  useEffect(() => {
    if (client === undefined || session === undefined) {
      return;
    }

    setState({ status: "loading" });

    const connected = client;
    const target = session;
    const controller = new AbortController();

    async function subscribe(): Promise<void> {
      try {
        const subscribed = await connected.subscribe(target);
        const { snapshot } = subscribed.result;

        if (snapshot === undefined || !isSessionState(snapshot.state)) {
          throw new Error("Session channel returned no state");
        }

        let current = snapshot.state;
        publish(current);

        for await (const event of subscribed.subscription) {
          const action = event.type === "action" ? event.params.action : undefined;

          if (action !== undefined && isSessionAction(action)) {
            current = AHPsessionReducer(current, action);
            publish(current);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "failed", message: errorMessage(error) });
        }
      }
    }

    function publish(sessionState: AHPSessionState): void {
      const { defaultChat } = sessionState;

      setState(
        defaultChat === undefined
          ? { status: "loading" }
          : { status: "ready", session: sessionState, chat: defaultChat },
      );
    }

    void subscribe();

    return (): void => {
      controller.abort();
      void connected.unsubscribe(target);
    };
  }, [client, session]);

  return state;
}
