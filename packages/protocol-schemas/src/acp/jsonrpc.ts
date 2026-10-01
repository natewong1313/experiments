import * as z from "zod";
import {
  JsonRpcCallSchema,
  JsonRpcErrorSchema,
  JsonRpcFailureSchema,
  JsonRpcSuccessSchema,
} from "../jsonrpc";

const RequestIdSchema = JsonRpcSuccessSchema.shape.id.nullable();
const ErrorSchema = JsonRpcErrorSchema.extend({ code: z.int32() }).loose();

const AcpMessageSchema = z.union([
  JsonRpcCallSchema.extend({
    id: RequestIdSchema.optional(),
    result: z.never().optional(),
    error: z.never().optional(),
  }).loose(),
  JsonRpcSuccessSchema.extend({
    id: RequestIdSchema,
    method: z.never().optional(),
    error: z.never().optional(),
  })
    .loose()
    .refine((value) => Object.hasOwn(value, "result"), {
      error: "ACP response requires a result",
    })
    .transform((value) => ({ ...value, result: value.result })),
  JsonRpcFailureSchema.extend({
    id: RequestIdSchema,
    error: ErrorSchema,
    method: z.never().optional(),
    result: z.never().optional(),
  }).loose(),
]);

type RequestId = z.output<typeof RequestIdSchema>;
type AcpError = z.output<typeof ErrorSchema>;
type AcpMessage = z.output<typeof AcpMessageSchema>;

export * from "../jsonrpc";
export {
  AcpMessageSchema,
  ErrorSchema,
  RequestIdSchema,
  type AcpError,
  type AcpMessage,
  type RequestId,
};
