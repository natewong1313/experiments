// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { RequestIdSchema, RequestIdOutboundSchema } from "./schemas-0";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import { McpServerAcpIdSchema, McpServerAcpIdOutboundSchema } from "./schemas-2";
import { McpRequestIdSchema, McpRequestIdOutboundSchema } from "./schemas-2";
import { NesSuggestionIdSchema, NesSuggestionIdOutboundSchema } from "./schemas-6";
import { RangeSchema, RangeOutboundSchema } from "./schemas-6";
import { PositionSchema, PositionOutboundSchema } from "./schemas-6";
import { ExtResponseSchema, ExtResponseOutboundSchema } from "./schemas-7";
import { ErrorSchema, ErrorOutboundSchema } from "./schemas-7";
import { ExtNotificationSchema, ExtNotificationOutboundSchema } from "./schemas-9";
import { WriteTextFileResponseSchema, WriteTextFileResponseOutboundSchema } from "./schemas-12";
import { ReadTextFileResponseSchema, ReadTextFileResponseOutboundSchema } from "./schemas-12";
import {
  RequestPermissionResponseSchema,
  RequestPermissionResponseOutboundSchema,
} from "./schemas-12";
import { CreateTerminalResponseSchema, CreateTerminalResponseOutboundSchema } from "./schemas-12";
import { TerminalOutputResponseSchema, TerminalOutputResponseOutboundSchema } from "./schemas-12";
import { ReleaseTerminalResponseSchema, ReleaseTerminalResponseOutboundSchema } from "./schemas-12";
import {
  WaitForTerminalExitResponseSchema,
  WaitForTerminalExitResponseOutboundSchema,
} from "./schemas-12";
import { KillTerminalResponseSchema, KillTerminalResponseOutboundSchema } from "./schemas-12";
import {
  CreateElicitationResponseSchema,
  CreateElicitationResponseOutboundSchema,
} from "./schemas-12";
const McpErrorSchema = z.looseObject({
  code: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  message: z.string(),
  data: z.unknown().optional(),
});
const McpErrorOutboundSchema = z.looseObject({
  code: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  message: z.string(),
  data: z.unknown().optional(),
});
type McpError = z.output<typeof McpErrorSchema>;
const MessageMcpResponseSchema = z.union([
  z.looseObject({
    result: z.unknown(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    error: McpErrorSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
const MessageMcpResponseOutboundSchema = z.union([
  z.strictObject({
    result: z.unknown(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    error: McpErrorOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
type MessageMcpResponse = z.output<typeof MessageMcpResponseSchema>;
const ClientResponseSchema = z.union([
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
const ClientResponseOutboundSchema = z.union([
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
type ClientResponse = z.output<typeof ClientResponseSchema>;
const CancelNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CancelNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CancelNotification = z.output<typeof CancelNotificationSchema>;
const DidOpenDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  languageId: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DidOpenDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  languageId: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type DidOpenDocumentNotification = z.output<typeof DidOpenDocumentNotificationSchema>;
const TextDocumentContentChangeEventSchema = z.looseObject({
  range: z.union([RangeSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TextDocumentContentChangeEventOutboundSchema = z.strictObject({
  range: z.union([RangeOutboundSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type TextDocumentContentChangeEvent = z.output<typeof TextDocumentContentChangeEventSchema>;
const DidChangeDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  contentChanges: z.array(TextDocumentContentChangeEventSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DidChangeDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  contentChanges: z.array(TextDocumentContentChangeEventOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type DidChangeDocumentNotification = z.output<typeof DidChangeDocumentNotificationSchema>;
const DidCloseDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DidCloseDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type DidCloseDocumentNotification = z.output<typeof DidCloseDocumentNotificationSchema>;
const DidSaveDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DidSaveDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type DidSaveDocumentNotification = z.output<typeof DidSaveDocumentNotificationSchema>;
const DidFocusDocumentNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  position: PositionSchema,
  visibleRange: RangeSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DidFocusDocumentNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  position: PositionOutboundSchema,
  visibleRange: RangeOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type DidFocusDocumentNotification = z.output<typeof DidFocusDocumentNotificationSchema>;
const AcceptNesNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  id: NesSuggestionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AcceptNesNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  id: NesSuggestionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type AcceptNesNotification = z.output<typeof AcceptNesNotificationSchema>;
const NesRejectReasonSchema = z.union([
  z.literal("rejected"),
  z.literal("ignored"),
  z.literal("replaced"),
  z.literal("cancelled"),
]);
const NesRejectReasonOutboundSchema = z.union([
  z.literal("rejected"),
  z.literal("ignored"),
  z.literal("replaced"),
  z.literal("cancelled"),
]);
type NesRejectReason = z.output<typeof NesRejectReasonSchema>;
const RejectNesNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  id: NesSuggestionIdSchema,
  reason: z.union([NesRejectReasonSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const RejectNesNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  id: NesSuggestionIdOutboundSchema,
  reason: z.union([NesRejectReasonOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type RejectNesNotification = z.output<typeof RejectNesNotificationSchema>;
const MessageMcpNotificationSchema = z.looseObject({
  serverId: McpServerAcpIdSchema,
  requestId: McpRequestIdSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const MessageMcpNotificationOutboundSchema = z.strictObject({
  serverId: McpServerAcpIdOutboundSchema,
  requestId: McpRequestIdOutboundSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type MessageMcpNotification = z.output<typeof MessageMcpNotificationSchema>;
const ClientNotificationSchema = z.looseObject({
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
const ClientNotificationOutboundSchema = z.strictObject({
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
type ClientNotification = z.output<typeof ClientNotificationSchema>;
const CancelRequestNotificationSchema = z.looseObject({
  requestId: RequestIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CancelRequestNotificationOutboundSchema = z.strictObject({
  requestId: RequestIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CancelRequestNotification = z.output<typeof CancelRequestNotificationSchema>;
export {
  McpErrorSchema,
  McpErrorOutboundSchema,
  type McpError,
  MessageMcpResponseSchema,
  MessageMcpResponseOutboundSchema,
  type MessageMcpResponse,
  ClientResponseSchema,
  ClientResponseOutboundSchema,
  type ClientResponse,
  CancelNotificationSchema,
  CancelNotificationOutboundSchema,
  type CancelNotification,
  DidOpenDocumentNotificationSchema,
  DidOpenDocumentNotificationOutboundSchema,
  type DidOpenDocumentNotification,
  TextDocumentContentChangeEventSchema,
  TextDocumentContentChangeEventOutboundSchema,
  type TextDocumentContentChangeEvent,
  DidChangeDocumentNotificationSchema,
  DidChangeDocumentNotificationOutboundSchema,
  type DidChangeDocumentNotification,
  DidCloseDocumentNotificationSchema,
  DidCloseDocumentNotificationOutboundSchema,
  type DidCloseDocumentNotification,
  DidSaveDocumentNotificationSchema,
  DidSaveDocumentNotificationOutboundSchema,
  type DidSaveDocumentNotification,
  DidFocusDocumentNotificationSchema,
  DidFocusDocumentNotificationOutboundSchema,
  type DidFocusDocumentNotification,
  AcceptNesNotificationSchema,
  AcceptNesNotificationOutboundSchema,
  type AcceptNesNotification,
  NesRejectReasonSchema,
  NesRejectReasonOutboundSchema,
  type NesRejectReason,
  RejectNesNotificationSchema,
  RejectNesNotificationOutboundSchema,
  type RejectNesNotification,
  MessageMcpNotificationSchema,
  MessageMcpNotificationOutboundSchema,
  type MessageMcpNotification,
  ClientNotificationSchema,
  ClientNotificationOutboundSchema,
  type ClientNotification,
  CancelRequestNotificationSchema,
  CancelRequestNotificationOutboundSchema,
  type CancelRequestNotification,
};
