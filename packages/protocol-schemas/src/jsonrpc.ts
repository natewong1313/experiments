import * as z from "zod";

const jsonRpcIdSchema = z.union([z.string(), z.number()]);
const jsonRpcVersionSchema = z.literal("2.0");

export const JsonRpcErrorSchema = z.strictObject({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const JsonRpcRequestSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  id: jsonRpcIdSchema,
  method: z.string(),
  params: z.unknown().optional(),
});

export const JsonRpcCallSchema = JsonRpcRequestSchema.partial({ id: true });

export const JsonRpcNotificationSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  method: z.string(),
  params: z.unknown().optional(),
});

export const JsonRpcSuccessSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  id: jsonRpcIdSchema,
  result: z.unknown(),
});

export const JsonRpcFailureSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  id: jsonRpcIdSchema,
  error: JsonRpcErrorSchema,
});

export const JsonRpcReplySchema = z.union([JsonRpcSuccessSchema, JsonRpcFailureSchema]);

export type JsonRpcError = z.output<typeof JsonRpcErrorSchema>;

export type JsonRpcRequest = z.output<typeof JsonRpcRequestSchema>;

export type JsonRpcCall = z.output<typeof JsonRpcCallSchema>;

export type JsonRpcNotification = z.output<typeof JsonRpcNotificationSchema>;

export type JsonRpcSuccess = z.output<typeof JsonRpcSuccessSchema>;

export type JsonRpcFailure = z.output<typeof JsonRpcFailureSchema>;

export type JsonRpcReply = z.output<typeof JsonRpcReplySchema>;
