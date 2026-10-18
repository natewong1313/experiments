import type { JsonRpcFailure, JsonRpcMessage } from "@experiments/protocol-schemas/ahp";
import type { AHPError } from "../shared/protocol";
import type { RootEvent } from "../shared/rpc/router";

/** The WebSocket close codes that the router uses. */
export const CloseCode = { Normal: 1000, InternalError: 1011 } as const;

/**
 * Sends a JSON-RPC message to the socket.
 * If the socket is not open, this function does nothing.
 */
export function send(socket: WebSocket, message: JsonRpcMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** Sends an `AHPError` to the socket as the JSON-RPC error reply for request `id`. */
export function sendError(socket: WebSocket, id: JsonRpcFailure["id"], error: AHPError): void {
  send(socket, {
    jsonrpc: "2.0",
    id,
    error: { code: error.code, message: error.message, data: error.data },
  });
}

/** A root event that the router sends without a `serverSeq`. */
type RootNotification = Exclude<RootEvent, { kind: "action" }>;

/** Encodes a root event without a `serverSeq` as a JSON-RPC notification. */
export function rootNotification(channel: string, event: RootNotification): JsonRpcMessage {
  switch (event.kind) {
    case "sessionAdded": {
      return {
        jsonrpc: "2.0",
        method: "root/sessionAdded",
        params: { channel, summary: event.summary },
      };
    }

    case "sessionRemoved": {
      return {
        jsonrpc: "2.0",
        method: "root/sessionRemoved",
        params: { channel, session: event.session },
      };
    }

    case "sessionSummaryChanged": {
      const params = { channel, session: event.session, changes: event.changes };

      return { jsonrpc: "2.0", method: "root/sessionSummaryChanged", params };
    }
  }
}
