import { PROTOCOL_VERSION as AHPPROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { AhpClient } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport as AHPWebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import { useEffect, useState } from "react";

import { errorMessage } from "~/lib/error-message";

/** The state of the browser's AHP connection. */
export type AhpConnectionState =
  | { status: "connecting" }
  | { status: "ready"; client: AhpClient; clientId: string }
  | { status: "failed"; message: string };

/**
 * Opens an AHP connection and completes the `initialize` handshake.
 *
 * @param url - Absolute WebSocket URL of the host's AHP endpoint.
 */
async function openClient(url: string, clientId: string): Promise<AhpClient> {
  const transport = await AHPWebSocketTransport.connect(url);
  const client = new AhpClient(transport);

  client.connect();

  await client.initialize({
    clientId,
    protocolVersions: [AHPPROTOCOL_VERSION],
  });

  return client;
}

/**
 * Connects to an AHP host for the lifetime of the calling component.
 *
 * The connection opens once per URL and is shut down when the component
 * unmounts. A component that needs several channels shares this one client.
 *
 * The connection opens once the URL is known, which lets a component derive it
 * from the browser location after mount.
 *
 * @param url - Absolute WebSocket URL of the host's AHP endpoint.
 */
export function useAhpConnection(url: string | undefined): AhpConnectionState {
  const [state, setState] = useState<AhpConnectionState>({ status: "connecting" });

  useEffect(() => {
    if (url === undefined) {
      return;
    }

    const endpoint = url;
    const controller = new AbortController();
    let opened: AhpClient | undefined;

    async function connect(): Promise<void> {
      try {
        const clientId = crypto.randomUUID();
        const client = await openClient(endpoint, clientId);

        if (controller.signal.aborted) {
          await client.shutdown();

          return;
        }

        opened = client;
        setState({ status: "ready", client, clientId });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: "failed", message: errorMessage(error) });
        }
      }
    }

    void connect();

    return (): void => {
      controller.abort();

      if (opened !== undefined) {
        void opened.shutdown();
      }
    };
  }, [url]);

  return state;
}
