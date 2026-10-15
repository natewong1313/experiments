import type { JsonRpcFailure, JsonRpcMessage } from "@experiments/protocol-schemas/ahp";
import type { AHPError } from "../shared/protocol";

/** The WebSocket close codes that the host uses. */
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
