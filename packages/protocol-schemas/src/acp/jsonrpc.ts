import * as z from "zod";
import {
  JsonRpcCallSchema,
  JsonRpcErrorSchema,
  JsonRpcFailureSchema,
  JsonRpcSuccessSchema,
} from "../jsonrpc";

const RequestIdSchema = JsonRpcSuccessSchema.shape.id.nullable();

const ErrorSchema = JsonRpcErrorSchema.extend({ code: z.int32() }).loose();

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
  error: ErrorSchema.strict(),
  method: z.never().optional(),
  result: z.never().optional(),
});

const AcpMessageSchema = z.union([
  AcpCallSchema.loose(),
  AcpSuccessSchema.loose().transform((value) => ({
    ...value,
    result: value.result,
  })),
  AcpFailureSchema.extend({ error: ErrorSchema }).loose(),
]);

const AcpOutboundMessageSchema = z.union([
  AcpCallSchema,
  AcpSuccessSchema.transform((value) => ({ ...value, result: value.result })),
  AcpFailureSchema,
]);

type RequestId = z.output<typeof RequestIdSchema>;

type AcpError = z.output<typeof ErrorSchema>;

type AcpMessage = z.output<typeof AcpMessageSchema>;

type AcpOutboundMessage = z.output<typeof AcpOutboundMessageSchema>;

export * from "../jsonrpc";

export {
  AcpMessageSchema,
  AcpOutboundMessageSchema,
  ErrorSchema,
  RequestIdSchema,
  type AcpError,
  type AcpMessage,
  type AcpOutboundMessage,
  type RequestId,
};
