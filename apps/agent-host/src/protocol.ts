import * as z from "zod";
import { JsonRpcErrorCodes } from "@microsoft/agent-host-protocol";
import type {
  JsonRpcNotification,
  JsonRpcSuccess,
  JsonRpcFailure,
} from "@experiments/protocol-schemas";

export type JsonRpcMessage = JsonRpcNotification | JsonRpcSuccess | JsonRpcFailure;

export const ROOT_CHANNEL = "ahp-root://";

export const MessageSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

export const ChannelSchema = z.object({ channel: z.string() });

export const DispatchSchema = z.object({
  channel: z.string(),
  clientSeq: z.int().nonnegative(),
  // Unknown action payloads must survive rejection echoes.
  // oxlint-disable-next-line zod/consistent-object-schema-type
  action: z.looseObject({ type: z.string() }),
});

export class ProtocolError extends Error {
  readonly code: number;

  constructor(message: string, code: number = JsonRpcErrorCodes.InvalidParams) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

export function send(socket: WebSocket, message: JsonRpcMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// Exceptions can contain any thrown value, including values outside the wire schemas.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Agent operation failed";
}
