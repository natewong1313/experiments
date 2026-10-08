import * as z from "zod";
import { JsonRpcCallSchema, JsonRpcFailureSchema, JsonRpcSuccessSchema } from "../jsonrpc";

import { ErrorSchema, ErrorOutboundSchema, RequestIdSchema } from "./generated";

const AcpCallSchema = JsonRpcCallSchema.extend({
  id: RequestIdSchema.optional(),
  result: z.never().optional(),
  error: z.never().optional(),
});

const AcpSuccessSchema = JsonRpcSuccessSchema.extend({
  id: RequestIdSchema,
  method: z.never().optional(),
  error: z.never().optional(),
}).refine((value) => Object.hasOwn(value, "result"), {
  error: "ACP response requires a result",
});

const AcpFailureSchema = JsonRpcFailureSchema.extend({
  id: RequestIdSchema,
  error: ErrorOutboundSchema,
  method: z.never().optional(),
  result: z.never().optional(),
});

export const AcpMessageSchema = z.union([
  AcpCallSchema.loose(),
  AcpSuccessSchema.loose().transform((value) => ({
    ...value,
    result: value.result,
  })),
  AcpFailureSchema.extend({ error: ErrorSchema }).loose(),
]);

export const AcpOutboundMessageSchema = z.union([
  AcpCallSchema,
  AcpSuccessSchema.transform((value) => ({ ...value, result: value.result })),
  AcpFailureSchema,
]);

export type AcpError = z.output<typeof ErrorSchema>;

export type AcpMessage = z.output<typeof AcpMessageSchema>;

export type AcpOutboundMessage = z.output<typeof AcpOutboundMessageSchema>;

export * from "../jsonrpc";
