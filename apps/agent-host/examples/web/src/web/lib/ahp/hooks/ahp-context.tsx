import type { AhpClient } from "@microsoft/agent-host-protocol/client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { useAhpConnection, type AhpConnectionState } from "./use-ahp-connection";
import { HOST_ID } from "../host";

const AhpContext = createContext<AhpConnectionState | undefined>(undefined);

type AhpProviderProps = {
  children: ReactNode;
};

/**
 * Shares one AHP connection with every route in the app.
 *
 * The connection outlives navigation, so moving between the session list and a
 * session keeps the WebSocket and the host's subscriptions intact.
 */
export function AhpProvider({ children }: AhpProviderProps): ReactElement {
  const [url, setUrl] = useState<string>();

  useEffect((): void => {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ahpUrl = `${scheme}//${window.location.host}/hosts/${HOST_ID}/ahp`;
    setUrl(ahpUrl);
  }, []);

  const state = useAhpConnection(url);

  return <AhpContext.Provider value={state}>{children}</AhpContext.Provider>;
}

/** Reads the shared connection state. */
export function useAhpConnectionState(): AhpConnectionState {
  const state = useContext(AhpContext);

  if (state === undefined) {
    throw new Error("An AHP hook was used outside AhpProvider");
  }

  return state;
}

/** Returns the shared client, or `undefined` while the connection opens. */
export function useAhpClient(): AhpClient | undefined {
  const state = useAhpConnectionState();

  return state.status === "ready" ? state.client : undefined;
}
