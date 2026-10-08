import * as z from "zod";
import { clientIdSchema, uriSchema, type JsonRpcCall } from "@experiments/protocol-schemas/ahp";

export const ROOT = "ahp-root://";
export const MAX_SUBSCRIPTIONS = 64;
export const MAX_FRAME_BYTES = 1_048_576;
export const MAX_ATTACHMENT_BYTES = 2048;
const MAX_CLIENT_ID_LENGTH = 256;
const MAX_CHANNEL_LENGTH = 512;
const MIN_LENGTH = 1;
export const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;
export const NORMAL_CLOSE = 1000;
export const INVALID_FRAME_CLOSE = 1003;
export const FAILED_CONNECTION_CLOSE = 1011;
export const VERSION_REJECT_CLOSE = 1002;

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export type JsonObject = { [key: string]: JsonValue };

export type RpcResult = object | null;

export const STATUS_UPGRADE_REQUIRED = 426;
export const STATUS_NOT_FOUND = 404;
const channelSchema = uriSchema.min(MIN_LENGTH).max(MAX_CHANNEL_LENGTH);
const boundedClientIdSchema = clientIdSchema.max(MAX_CLIENT_ID_LENGTH);
const subscriptionsSchema = z.array(channelSchema).max(MAX_SUBSCRIPTIONS);

export const ConnectionSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("new") }),
  z.object({
    phase: z.literal("ready"),
    clientId: boundedClientIdSchema,
    subscriptions: subscriptionsSchema,
  }),
]);

const HostRequestLimitsSchema = z.object({
  channel: channelSchema,
  clientId: boundedClientIdSchema.optional(),
  initialSubscriptions: subscriptionsSchema.optional(),
  subscriptions: subscriptionsSchema.optional(),
  limit: z.int().positive().max(MAX_PAGE_SIZE).optional(),
});

export const RpcCodes = {
  parse: -32_700,
  request: -32_600,
  method: -32_601,
  params: -32_602,
  internal: -32_603,
  sessionMissing: -32_001,
  providerMissing: -32_002,
  sessionExists: -32_003,
  version: -32_005,
};

export class ProtocolError extends Error {
  override readonly name = "ProtocolError";
  readonly code: number;
  readonly data: JsonValue | undefined;

  constructor(code: number, message: string, data?: JsonValue) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

export type Connection = z.output<typeof ConnectionSchema>;

export function parseHostParams<T>(schema: z.ZodType<T>, params: JsonRpcCall["params"]): T {
  const input = schema.parse(params);
  HostRequestLimitsSchema.parse(input);

  return input;
}

export function errorMessage(error: Error): string {
  return error.message;
}
