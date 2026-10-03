import * as z from "zod";

const jsonRpcIdSchema = z.union([z.string(), z.number()]);

const jsonRpcVersionSchema = z.literal("2.0");

const JsonRpcErrorSchema = z.strictObject({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

const JsonRpcRequestSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  id: jsonRpcIdSchema,
  method: z.string(),
  params: z.unknown().optional(),
});

const JsonRpcCallSchema = JsonRpcRequestSchema.partial({ id: true });

const JsonRpcNotificationSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  method: z.string(),
  params: z.unknown().optional(),
});

const JsonRpcSuccessSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  id: jsonRpcIdSchema,
  result: z.unknown(),
});

const JsonRpcFailureSchema = z.strictObject({
  jsonrpc: jsonRpcVersionSchema,
  id: jsonRpcIdSchema,
  error: JsonRpcErrorSchema,
});

const JsonRpcReplySchema = z.union([JsonRpcSuccessSchema, JsonRpcFailureSchema]);

type JsonRpcError = z.output<typeof JsonRpcErrorSchema>;

type JsonRpcRequest = z.output<typeof JsonRpcRequestSchema>;

type JsonRpcCall = z.output<typeof JsonRpcCallSchema>;

type JsonRpcNotification = z.output<typeof JsonRpcNotificationSchema>;

type JsonRpcSuccess = z.output<typeof JsonRpcSuccessSchema>;

type JsonRpcFailure = z.output<typeof JsonRpcFailureSchema>;

type JsonRpcReply = z.output<typeof JsonRpcReplySchema>;

export {
  JsonRpcCallSchema,
  JsonRpcErrorSchema,
  JsonRpcFailureSchema,
  JsonRpcNotificationSchema,
  JsonRpcReplySchema,
  JsonRpcRequestSchema,
  JsonRpcSuccessSchema,
  type JsonRpcError,
  type JsonRpcCall,
  type JsonRpcFailure,
  type JsonRpcNotification,
  type JsonRpcReply,
  type JsonRpcRequest,
  type JsonRpcSuccess,
};
