// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { RequestIdSchema, RequestIdOutboundSchema } from "./schemas-0";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import { TerminalIdSchema, TerminalIdOutboundSchema } from "./schemas-1";
import { PermissionOptionIdSchema, PermissionOptionIdOutboundSchema } from "./schemas-1";
import { ExtRequestSchema, ExtRequestOutboundSchema } from "./schemas-2";
import { RangeSchema, RangeOutboundSchema } from "./schemas-6";
import { PositionSchema, PositionOutboundSchema } from "./schemas-6";
import { InitializeRequestSchema, InitializeRequestOutboundSchema } from "./schemas-10";
import { AuthenticateRequestSchema, AuthenticateRequestOutboundSchema } from "./schemas-10";
import { ListProvidersRequestSchema, ListProvidersRequestOutboundSchema } from "./schemas-10";
import { SetProviderRequestSchema, SetProviderRequestOutboundSchema } from "./schemas-10";
import { DisableProviderRequestSchema, DisableProviderRequestOutboundSchema } from "./schemas-10";
import { LogoutRequestSchema, LogoutRequestOutboundSchema } from "./schemas-10";
import { NewSessionRequestSchema, NewSessionRequestOutboundSchema } from "./schemas-11";
import { LoadSessionRequestSchema, LoadSessionRequestOutboundSchema } from "./schemas-11";
import { ListSessionsRequestSchema, ListSessionsRequestOutboundSchema } from "./schemas-11";
import { DeleteSessionRequestSchema, DeleteSessionRequestOutboundSchema } from "./schemas-11";
import { ForkSessionRequestSchema, ForkSessionRequestOutboundSchema } from "./schemas-11";
import { ResumeSessionRequestSchema, ResumeSessionRequestOutboundSchema } from "./schemas-11";
import { CloseSessionRequestSchema, CloseSessionRequestOutboundSchema } from "./schemas-11";
import { SetSessionModeRequestSchema, SetSessionModeRequestOutboundSchema } from "./schemas-11";
import {
  SetSessionConfigOptionRequestSchema,
  SetSessionConfigOptionRequestOutboundSchema,
} from "./schemas-11";
import { PromptRequestSchema, PromptRequestOutboundSchema } from "./schemas-11";
import { StartNesRequestSchema, StartNesRequestOutboundSchema } from "./schemas-11";
import { NesTriggerKindSchema, NesTriggerKindOutboundSchema } from "./schemas-11";
import { NesRecentFileSchema, NesRecentFileOutboundSchema } from "./schemas-11";
import { NesRelatedSnippetSchema, NesRelatedSnippetOutboundSchema } from "./schemas-11";
import { NesEditHistoryEntrySchema, NesEditHistoryEntryOutboundSchema } from "./schemas-11";
import { NesUserActionSchema, NesUserActionOutboundSchema } from "./schemas-11";
import { NesOpenFileSchema, NesOpenFileOutboundSchema } from "./schemas-11";
const NesDiagnosticSeveritySchema = z.union([
  z.literal("error"),
  z.literal("warning"),
  z.literal("information"),
  z.literal("hint"),
]);
const NesDiagnosticSeverityOutboundSchema = z.union([
  z.literal("error"),
  z.literal("warning"),
  z.literal("information"),
  z.literal("hint"),
]);
type NesDiagnosticSeverity = z.output<typeof NesDiagnosticSeveritySchema>;
const NesDiagnosticSchema = z.looseObject({
  uri: z.string(),
  range: RangeSchema,
  severity: NesDiagnosticSeveritySchema,
  message: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesDiagnosticOutboundSchema = z.strictObject({
  uri: z.string(),
  range: RangeOutboundSchema,
  severity: NesDiagnosticSeverityOutboundSchema,
  message: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesDiagnostic = z.output<typeof NesDiagnosticSchema>;
const NesSuggestContextSchema = z.looseObject({
  recentFiles: z.union([z.array(NesRecentFileSchema), z.null()]).optional(),
  relatedSnippets: z.union([z.array(NesRelatedSnippetSchema), z.null()]).optional(),
  editHistory: z.union([z.array(NesEditHistoryEntrySchema), z.null()]).optional(),
  userActions: z.union([z.array(NesUserActionSchema), z.null()]).optional(),
  openFiles: z.union([z.array(NesOpenFileSchema), z.null()]).optional(),
  diagnostics: z.union([z.array(NesDiagnosticSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesSuggestContextOutboundSchema = z.strictObject({
  recentFiles: z.union([z.array(NesRecentFileOutboundSchema), z.null()]).optional(),
  relatedSnippets: z.union([z.array(NesRelatedSnippetOutboundSchema), z.null()]).optional(),
  editHistory: z.union([z.array(NesEditHistoryEntryOutboundSchema), z.null()]).optional(),
  userActions: z.union([z.array(NesUserActionOutboundSchema), z.null()]).optional(),
  openFiles: z.union([z.array(NesOpenFileOutboundSchema), z.null()]).optional(),
  diagnostics: z.union([z.array(NesDiagnosticOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesSuggestContext = z.output<typeof NesSuggestContextSchema>;
const SuggestNesRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  position: PositionSchema,
  selection: z.union([RangeSchema, z.null()]).optional(),
  triggerKind: NesTriggerKindSchema,
  context: z.union([NesSuggestContextSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SuggestNesRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  uri: z.string(),
  version: z.number().refine(Number.isInteger, { message: "Expected integer" }),
  position: PositionOutboundSchema,
  selection: z.union([RangeOutboundSchema, z.null()]).optional(),
  triggerKind: NesTriggerKindOutboundSchema,
  context: z.union([NesSuggestContextOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SuggestNesRequest = z.output<typeof SuggestNesRequestSchema>;
const CloseNesRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CloseNesRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CloseNesRequest = z.output<typeof CloseNesRequestSchema>;
const ClientRequestSchema = z.looseObject({
  id: RequestIdSchema,
  method: z.string(),
  params: z
    .union([
      z.union([
        InitializeRequestSchema,
        AuthenticateRequestSchema,
        ListProvidersRequestSchema,
        SetProviderRequestSchema,
        DisableProviderRequestSchema,
        LogoutRequestSchema,
        NewSessionRequestSchema,
        LoadSessionRequestSchema,
        ListSessionsRequestSchema,
        DeleteSessionRequestSchema,
        ForkSessionRequestSchema,
        ResumeSessionRequestSchema,
        CloseSessionRequestSchema,
        SetSessionModeRequestSchema,
        SetSessionConfigOptionRequestSchema,
        PromptRequestSchema,
        StartNesRequestSchema,
        SuggestNesRequestSchema,
        CloseNesRequestSchema,
        ExtRequestSchema,
      ]),
      z.null(),
    ])
    .optional(),
});
const ClientRequestOutboundSchema = z.strictObject({
  id: RequestIdOutboundSchema,
  method: z.string(),
  params: z
    .union([
      z.union([
        InitializeRequestOutboundSchema,
        AuthenticateRequestOutboundSchema,
        ListProvidersRequestOutboundSchema,
        SetProviderRequestOutboundSchema,
        DisableProviderRequestOutboundSchema,
        LogoutRequestOutboundSchema,
        NewSessionRequestOutboundSchema,
        LoadSessionRequestOutboundSchema,
        ListSessionsRequestOutboundSchema,
        DeleteSessionRequestOutboundSchema,
        ForkSessionRequestOutboundSchema,
        ResumeSessionRequestOutboundSchema,
        CloseSessionRequestOutboundSchema,
        SetSessionModeRequestOutboundSchema,
        SetSessionConfigOptionRequestOutboundSchema,
        PromptRequestOutboundSchema,
        StartNesRequestOutboundSchema,
        SuggestNesRequestOutboundSchema,
        CloseNesRequestOutboundSchema,
        ExtRequestOutboundSchema,
      ]),
      z.null(),
    ])
    .optional(),
});
type ClientRequest = z.output<typeof ClientRequestSchema>;
const WriteTextFileResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const WriteTextFileResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type WriteTextFileResponse = z.output<typeof WriteTextFileResponseSchema>;
const ReadTextFileResponseSchema = z.looseObject({
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ReadTextFileResponseOutboundSchema = z.strictObject({
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ReadTextFileResponse = z.output<typeof ReadTextFileResponseSchema>;
const SelectedPermissionOutcomeSchema = z.looseObject({
  optionId: PermissionOptionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SelectedPermissionOutcomeOutboundSchema = z.strictObject({
  optionId: PermissionOptionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SelectedPermissionOutcome = z.output<typeof SelectedPermissionOutcomeSchema>;
const RequestPermissionOutcomeSchema = z.union([
  z.looseObject({ outcome: z.literal("cancelled") }),
  z.looseObject({
    optionId: PermissionOptionIdSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    outcome: z.literal("selected"),
  }),
]);
const RequestPermissionOutcomeOutboundSchema = z.union([
  z.strictObject({ outcome: z.literal("cancelled") }),
  z.strictObject({
    optionId: PermissionOptionIdOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    outcome: z.literal("selected"),
  }),
]);
type RequestPermissionOutcome = z.output<typeof RequestPermissionOutcomeSchema>;
const RequestPermissionResponseSchema = z.looseObject({
  outcome: RequestPermissionOutcomeSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const RequestPermissionResponseOutboundSchema = z.strictObject({
  outcome: RequestPermissionOutcomeOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type RequestPermissionResponse = z.output<typeof RequestPermissionResponseSchema>;
const CreateTerminalResponseSchema = z.looseObject({
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CreateTerminalResponseOutboundSchema = z.strictObject({
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CreateTerminalResponse = z.output<typeof CreateTerminalResponseSchema>;
const TerminalExitStatusSchema = z.looseObject({
  exitCode: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  signal: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TerminalExitStatusOutboundSchema = z.strictObject({
  exitCode: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  signal: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type TerminalExitStatus = z.output<typeof TerminalExitStatusSchema>;
const TerminalOutputResponseSchema = z.looseObject({
  output: z.string(),
  truncated: z.boolean(),
  exitStatus: z.union([TerminalExitStatusSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TerminalOutputResponseOutboundSchema = z.strictObject({
  output: z.string(),
  truncated: z.boolean(),
  exitStatus: z.union([TerminalExitStatusOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type TerminalOutputResponse = z.output<typeof TerminalOutputResponseSchema>;
const ReleaseTerminalResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ReleaseTerminalResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ReleaseTerminalResponse = z.output<typeof ReleaseTerminalResponseSchema>;
const WaitForTerminalExitResponseSchema = z.looseObject({
  exitCode: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  signal: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const WaitForTerminalExitResponseOutboundSchema = z.strictObject({
  exitCode: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  signal: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type WaitForTerminalExitResponse = z.output<typeof WaitForTerminalExitResponseSchema>;
const KillTerminalResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const KillTerminalResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type KillTerminalResponse = z.output<typeof KillTerminalResponseSchema>;
const ElicitationContentValueSchema = z.union([
  z.string(),
  z.number().refine(Number.isInteger, { message: "Expected integer" }),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
const ElicitationContentValueOutboundSchema = z.union([
  z.string(),
  z.number().refine(Number.isInteger, { message: "Expected integer" }),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
type ElicitationContentValue = z.output<typeof ElicitationContentValueSchema>;
const ElicitationAcceptActionSchema = z.looseObject({
  content: z.union([z.record(z.string(), ElicitationContentValueSchema), z.null()]).optional(),
});
const ElicitationAcceptActionOutboundSchema = z.strictObject({
  content: z
    .union([z.record(z.string(), ElicitationContentValueOutboundSchema), z.null()])
    .optional(),
});
type ElicitationAcceptAction = z.output<typeof ElicitationAcceptActionSchema>;
const CreateElicitationResponseSchema = z.union([
  z.looseObject({
    content: z.union([z.record(z.string(), ElicitationContentValueSchema), z.null()]).optional(),
    action: z.literal("accept"),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    action: z.literal("decline"),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    action: z.literal("cancel"),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    action: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
const CreateElicitationResponseOutboundSchema = z.union([
  z.strictObject({
    content: z
      .union([z.record(z.string(), ElicitationContentValueOutboundSchema), z.null()])
      .optional(),
    action: z.literal("accept"),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    action: z.literal("decline"),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    action: z.literal("cancel"),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    action: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
type CreateElicitationResponse = z.output<typeof CreateElicitationResponseSchema>;
export {
  NesDiagnosticSeveritySchema,
  NesDiagnosticSeverityOutboundSchema,
  type NesDiagnosticSeverity,
  NesDiagnosticSchema,
  NesDiagnosticOutboundSchema,
  type NesDiagnostic,
  NesSuggestContextSchema,
  NesSuggestContextOutboundSchema,
  type NesSuggestContext,
  SuggestNesRequestSchema,
  SuggestNesRequestOutboundSchema,
  type SuggestNesRequest,
  CloseNesRequestSchema,
  CloseNesRequestOutboundSchema,
  type CloseNesRequest,
  ClientRequestSchema,
  ClientRequestOutboundSchema,
  type ClientRequest,
  WriteTextFileResponseSchema,
  WriteTextFileResponseOutboundSchema,
  type WriteTextFileResponse,
  ReadTextFileResponseSchema,
  ReadTextFileResponseOutboundSchema,
  type ReadTextFileResponse,
  SelectedPermissionOutcomeSchema,
  SelectedPermissionOutcomeOutboundSchema,
  type SelectedPermissionOutcome,
  RequestPermissionOutcomeSchema,
  RequestPermissionOutcomeOutboundSchema,
  type RequestPermissionOutcome,
  RequestPermissionResponseSchema,
  RequestPermissionResponseOutboundSchema,
  type RequestPermissionResponse,
  CreateTerminalResponseSchema,
  CreateTerminalResponseOutboundSchema,
  type CreateTerminalResponse,
  TerminalExitStatusSchema,
  TerminalExitStatusOutboundSchema,
  type TerminalExitStatus,
  TerminalOutputResponseSchema,
  TerminalOutputResponseOutboundSchema,
  type TerminalOutputResponse,
  ReleaseTerminalResponseSchema,
  ReleaseTerminalResponseOutboundSchema,
  type ReleaseTerminalResponse,
  WaitForTerminalExitResponseSchema,
  WaitForTerminalExitResponseOutboundSchema,
  type WaitForTerminalExitResponse,
  KillTerminalResponseSchema,
  KillTerminalResponseOutboundSchema,
  type KillTerminalResponse,
  ElicitationContentValueSchema,
  ElicitationContentValueOutboundSchema,
  type ElicitationContentValue,
  ElicitationAcceptActionSchema,
  ElicitationAcceptActionOutboundSchema,
  type ElicitationAcceptAction,
  CreateElicitationResponseSchema,
  CreateElicitationResponseOutboundSchema,
  type CreateElicitationResponse,
};
