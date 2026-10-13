import * as z from "zod";
import { JsonRpcErrorCodes, SessionStatus } from "@microsoft/agent-host-protocol";
import type {
  JsonRpcNotification,
  JsonRpcSuccess,
  JsonRpcFailure,
} from "@experiments/protocol-schemas";
import { SessionSummarySchema } from "@experiments/protocol-schemas/ahp";

export const SummarySchema = SessionSummarySchema.pick({
  provider: true,
  title: true,
  createdAt: true,
  modifiedAt: true,
  workingDirectories: true,
}).extend({
  status: z.union([
    z.literal(SessionStatus.Idle),
    z.literal(SessionStatus.InProgress),
    z.literal(SessionStatus.Error),
  ]),
});

export type JsonRpcMessage =
  | JsonRpcNotification
  | JsonRpcSuccess
  | (Omit<JsonRpcFailure, "id"> & { id: string | number | null });

export const ROOT_CHANNEL = "ahp-root://";
export const UUIDSchema = z.uuid().transform((id) => id.toLowerCase());

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

export function sessionUri(id: string): string {
  return `ahp-session:/${id}`;
}

export function chatUri(id: string): string {
  return `ahp-chat:/${id}`;
}

export function sessionKey(hostId: string, sessionId: string): string {
  return `${hostId}/${sessionId}`;
}

export function channelId(channel: string, scheme: "ahp-session" | "ahp-chat"): string {
  const prefix = `${scheme}:/`;

  if (!channel.startsWith(prefix)) {
    throw new ProtocolError(`Expected a ${scheme} channel`);
  }

  const id = UUIDSchema.parse(channel.slice(prefix.length));

  if (channel !== `${prefix}${id}`) {
    throw new ProtocolError("Channel UUID must use lowercase canonical form");
  }

  return id;
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
