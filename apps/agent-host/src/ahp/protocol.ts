import * as z from "zod";
import { clientIdSchema, uriSchema } from "@experiments/protocol-schemas/ahp";

const ROOT = "ahp-root://";
const MAX_SUBSCRIPTIONS = 64;
const MAX_FRAME_BYTES = 1_048_576;
const MAX_ATTACHMENT_BYTES = 2048;
const MAX_CLIENT_ID_LENGTH = 256;
const MAX_CHANNEL_LENGTH = 512;
const MIN_LENGTH = 1;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;
const NORMAL_CLOSE = 1000;
const INVALID_FRAME_CLOSE = 1003;
const FAILED_CONNECTION_CLOSE = 1011;
const VERSION_REJECT_CLOSE = 1002;
const STATUS_UPGRADE_REQUIRED = 426;
const STATUS_NOT_FOUND = 404;
const channelSchema = uriSchema.min(MIN_LENGTH).max(MAX_CHANNEL_LENGTH);
const boundedClientIdSchema = clientIdSchema.max(MAX_CLIENT_ID_LENGTH);
const subscriptionsSchema = z.array(channelSchema).max(MAX_SUBSCRIPTIONS);
const ConnectionSchema = z.discriminatedUnion("phase", [
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
const RpcCodes = {
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

class ProtocolError extends Error {
  override readonly name = "ProtocolError";
  readonly code: number;
  readonly data: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

type Connection = z.output<typeof ConnectionSchema>;

function parseHostParams<T>(schema: z.ZodType<T>, params: unknown): T {
  const input = schema.parse(params);
  HostRequestLimitsSchema.parse(input);
  return input;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Agent operation failed";
}

export {
  ROOT,
  MAX_SUBSCRIPTIONS,
  MAX_FRAME_BYTES,
  MAX_ATTACHMENT_BYTES,
  DEFAULT_PAGE_SIZE,
  NORMAL_CLOSE,
  INVALID_FRAME_CLOSE,
  FAILED_CONNECTION_CLOSE,
  VERSION_REJECT_CLOSE,
  STATUS_UPGRADE_REQUIRED,
  STATUS_NOT_FOUND,
  ConnectionSchema,
  RpcCodes,
  ProtocolError,
  parseHostParams,
  errorMessage,
  type Connection,
};
