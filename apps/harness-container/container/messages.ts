import type { AnyMessage } from "@agentclientprotocol/sdk";
import {
  zError as AcpErrorSchema,
  zRequestId as RequestIdSchema,
} from "@agentclientprotocol/sdk/dist/schema/zod.gen.js";
import * as z from "zod";
import type { RawData } from "ws";

const MAX_MESSAGE_BYTES = 1_048_576;
const textEncoder = new TextEncoder();
const UnknownSchema = z.unknown();
const ErrorSchema = AcpErrorSchema.catchall(UnknownSchema);
const RequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    method: z.string(),
    id: RequestIdSchema.optional(),
    params: UnknownSchema.optional(),
  })
  .catchall(UnknownSchema);
const ResultSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: RequestIdSchema,
    result: UnknownSchema,
  })
  .catchall(UnknownSchema)
  .refine((value) => "result" in value, "A response needs a result")
  .transform((value) => ({ ...value, result: value.result }));
const FailureSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: RequestIdSchema,
    error: ErrorSchema,
  })
  .catchall(UnknownSchema);
const MessageSchema = z.union([RequestSchema, ResultSchema, FailureSchema]);

function normalizeMessage(text: string): string {
  return JSON.stringify(parseMessage(text));
}

function parseMessage(text: string): AnyMessage {
  if (textEncoder.encode(text).byteLength > MAX_MESSAGE_BYTES) {
    throw new Error("ACP message exceeds the size limit");
  }
  const value: unknown = JSON.parse(text);
  return MessageSchema.parse(value);
}

function decodeFrame(data: RawData): string {
  const textDecoder = new TextDecoder("utf8", { fatal: true });
  if (Array.isArray(data)) {
    const parts = data.map((part) =>
      textDecoder.decode(part, { stream: true }),
    );
    return parts.join("") + textDecoder.decode();
  }
  return textDecoder.decode(data);
}

export { MAX_MESSAGE_BYTES, decodeFrame, normalizeMessage, parseMessage };
