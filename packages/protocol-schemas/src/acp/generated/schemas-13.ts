// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import {
  RequestIdSchema,
  RequestIdOutboundSchema,
  SessionIdSchema,
  SessionIdOutboundSchema,
} from "./schemas-0";
import {
  McpServerAcpIdSchema,
  McpServerAcpIdOutboundSchema,
  McpRequestIdSchema,
  McpRequestIdOutboundSchema,
} from "./schemas-2";
import {
  NesSuggestionIdSchema,
  NesSuggestionIdOutboundSchema,
  RangeSchema,
  RangeOutboundSchema,
  PositionSchema,
  PositionOutboundSchema,
} from "./schemas-6";
import {
  ExtResponseSchema,
  ExtResponseOutboundSchema,
  ErrorSchema,
  ErrorOutboundSchema,
} from "./schemas-7";
import { ExtNotificationSchema, ExtNotificationOutboundSchema } from "./schemas-9";
import {
  WriteTextFileResponseSchema,
  WriteTextFileResponseOutboundSchema,
  ReadTextFileResponseSchema,
  ReadTextFileResponseOutboundSchema,
  RequestPermissionResponseSchema,
  RequestPermissionResponseOutboundSchema,
  CreateTerminalResponseSchema,
  CreateTerminalResponseOutboundSchema,
  TerminalOutputResponseSchema,
  TerminalOutputResponseOutboundSchema,
  ReleaseTerminalResponseSchema,
  ReleaseTerminalResponseOutboundSchema,
  WaitForTerminalExitResponseSchema,
  WaitForTerminalExitResponseOutboundSchema,
  KillTerminalResponseSchema,
  KillTerminalResponseOutboundSchema,
  CreateElicitationResponseSchema,
  CreateElicitationResponseOutboundSchema,
} from "./schemas-12";

export const McpErrorSchema = z.looseObject({
  code: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  message: z.string(),
  data: z.unknown().optional(),
});

export const McpErrorOutboundSchema = z.looseObject({
  code: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  message: z.string(),
  data: z.unknown().optional(),
});

export type McpError = z.output<typeof McpErrorSchema>;

export const MessageMcpResponseSchema = z.union([
  z.looseObject({
    result: z.unknown(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    error: McpErrorSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);

export const MessageMcpResponseOutboundSchema = z.union([
  z.strictObject({
    result: z.unknown(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    error: McpErrorOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);

export type MessageMcpResponse = z.output<typeof MessageMcpResponseSchema>;

export const ClientResponseSchema = z.union([
  z.looseObject({
    id: RequestIdSchema,
    result: z.union([
      WriteTextFileResponseSchema,
      ReadTextFileResponseSchema,
      RequestPermissionResponseSchema,
      CreateTerminalResponseSchema,
      TerminalOutputResponseSchema,
      ReleaseTerminalResponseSchema,
      WaitForTerminalExitResponseSchema,
      KillTerminalResponseSchema,
      CreateElicitationResponseSchema,
      MessageMcpResponseSchema,
      ExtResponseSchema,
    ]),
  }),
  z.looseObject({ id: RequestIdSchema, error: ErrorSchema }),
]);

export const ClientResponseOutboundSchema = z.union([
  z.strictObject({
    id: RequestIdOutboundSchema,
    result: z.union([
      WriteTextFileResponseOutboundSchema,
      ReadTextFileResponseOutboundSchema,
      RequestPermissionResponseOutboundSchema,
      CreateTerminalResponseOutboundSchema,
      TerminalOutputResponseOutboundSchema,
      ReleaseTerminalResponseOutboundSchema,
      WaitForTerminalExitResponseOutboundSchema,
      KillTerminalResponseOutboundSchema,
      CreateElicitationResponseOutboundSchema,
      MessageMcpResponseOutboundSchema,
      ExtResponseOutboundSchema,
    ]),
  }),
  z.strictObject({ id: RequestIdOutboundSchema, error: ErrorOutboundSchema }),
]);

export type ClientResponse = z.output<typeof ClientResponseSchema>;

export const CancelNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CancelNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CancelNotification = z.output<typeof CancelNotificationSchema>;

export const DidOpenDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  languageId: z.string(),
  version: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DidOpenDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  languageId: z.string(),
  version: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DidOpenDocumentNotification = z.output<typeof DidOpenDocumentNotificationSchema>;

export const TextDocumentContentChangeEventSchema = z.looseObject({
  range: z.union([RangeSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const TextDocumentContentChangeEventOutboundSchema = z.strictObject({
  range: z.union([RangeOutboundSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type TextDocumentContentChangeEvent = z.output<typeof TextDocumentContentChangeEventSchema>;

export const DidChangeDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  contentChanges: z.array(TextDocumentContentChangeEventSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DidChangeDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  contentChanges: z.array(TextDocumentContentChangeEventOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DidChangeDocumentNotification = z.output<typeof DidChangeDocumentNotificationSchema>;

export const DidCloseDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DidCloseDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DidCloseDocumentNotification = z.output<typeof DidCloseDocumentNotificationSchema>;

export const DidSaveDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DidSaveDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DidSaveDocumentNotification = z.output<typeof DidSaveDocumentNotificationSchema>;

export const DidFocusDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  position: PositionSchema,
  visibleRange: RangeSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DidFocusDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { error: "Expected integer" }),
  position: PositionOutboundSchema,
  visibleRange: RangeOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DidFocusDocumentNotification = z.output<typeof DidFocusDocumentNotificationSchema>;

export const AcceptNesNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  id: NesSuggestionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AcceptNesNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  id: NesSuggestionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AcceptNesNotification = z.output<typeof AcceptNesNotificationSchema>;

export const NesRejectReasonSchema = z.enum(["rejected", "ignored", "replaced", "cancelled"]);

export const NesRejectReasonOutboundSchema = z.enum([
  "rejected",
  "ignored",
  "replaced",
  "cancelled",
]);

export type NesRejectReason = z.output<typeof NesRejectReasonSchema>;

export const RejectNesNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  id: NesSuggestionIdSchema,
  reason: z.union([NesRejectReasonSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const RejectNesNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  id: NesSuggestionIdOutboundSchema,
  reason: z.union([NesRejectReasonOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type RejectNesNotification = z.output<typeof RejectNesNotificationSchema>;

export const MessageMcpNotificationSchema = z.looseObject({
  serverId: McpServerAcpIdSchema,
  requestId: McpRequestIdSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const MessageMcpNotificationOutboundSchema = z.strictObject({
  serverId: McpServerAcpIdOutboundSchema,
  requestId: McpRequestIdOutboundSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type MessageMcpNotification = z.output<typeof MessageMcpNotificationSchema>;

export const ClientNotificationSchema = z.looseObject({
  method: z.string(),
  params: z
    .union([
      z.union([
        CancelNotificationSchema,
        DidOpenDocumentNotificationSchema,
        DidChangeDocumentNotificationSchema,
        DidCloseDocumentNotificationSchema,
        DidSaveDocumentNotificationSchema,
        DidFocusDocumentNotificationSchema,
        AcceptNesNotificationSchema,
        RejectNesNotificationSchema,
        MessageMcpNotificationSchema,
        ExtNotificationSchema,
      ]),
      z.null(),
    ])
    .optional(),
});

export const ClientNotificationOutboundSchema = z.strictObject({
  method: z.string(),
  params: z
    .union([
      z.union([
        CancelNotificationOutboundSchema,
        DidOpenDocumentNotificationOutboundSchema,
        DidChangeDocumentNotificationOutboundSchema,
        DidCloseDocumentNotificationOutboundSchema,
        DidSaveDocumentNotificationOutboundSchema,
        DidFocusDocumentNotificationOutboundSchema,
        AcceptNesNotificationOutboundSchema,
        RejectNesNotificationOutboundSchema,
        MessageMcpNotificationOutboundSchema,
        ExtNotificationOutboundSchema,
      ]),
      z.null(),
    ])
    .optional(),
});

export type ClientNotification = z.output<typeof ClientNotificationSchema>;

export const CancelRequestNotificationSchema = z.looseObject({
  requestId: RequestIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CancelRequestNotificationOutboundSchema = z.strictObject({
  requestId: RequestIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CancelRequestNotification = z.output<typeof CancelRequestNotificationSchema>;
