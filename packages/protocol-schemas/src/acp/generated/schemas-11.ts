// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import {
  SessionIdSchema,
  SessionIdOutboundSchema,
  ContentBlockSchema,
  ContentBlockOutboundSchema,
} from "./schemas-0";
import {
  SessionModeIdSchema,
  SessionModeIdOutboundSchema,
  SessionConfigIdSchema,
  SessionConfigIdOutboundSchema,
  SessionConfigValueIdSchema,
  SessionConfigValueIdOutboundSchema,
} from "./schemas-5";
import {
  RangeSchema,
  RangeOutboundSchema,
  PositionSchema,
  PositionOutboundSchema,
} from "./schemas-6";
import { McpServerSchema, McpServerOutboundSchema } from "./schemas-10";

const NewSessionRequestSchema = z.looseObject({
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NewSessionRequestOutboundSchema = z.strictObject({
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NewSessionRequest = z.output<typeof NewSessionRequestSchema>;

const LoadSessionRequestSchema = z.looseObject({
  mcpServers: z.array(McpServerSchema),
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const LoadSessionRequestOutboundSchema = z.strictObject({
  mcpServers: z.array(McpServerOutboundSchema),
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type LoadSessionRequest = z.output<typeof LoadSessionRequestSchema>;

const ListSessionsRequestSchema = z.looseObject({
  cwd: z.union([z.string(), z.null()]).optional(),
  cursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ListSessionsRequestOutboundSchema = z.strictObject({
  cwd: z.union([z.string(), z.null()]).optional(),
  cursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type ListSessionsRequest = z.output<typeof ListSessionsRequestSchema>;

const DeleteSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const DeleteSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type DeleteSessionRequest = z.output<typeof DeleteSessionRequestSchema>;

const ForkSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ForkSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerOutboundSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type ForkSessionRequest = z.output<typeof ForkSessionRequestSchema>;

const ResumeSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ResumeSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerOutboundSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type ResumeSessionRequest = z.output<typeof ResumeSessionRequestSchema>;

const CloseSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const CloseSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type CloseSessionRequest = z.output<typeof CloseSessionRequestSchema>;

const SetSessionModeRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  modeId: SessionModeIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const SetSessionModeRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  modeId: SessionModeIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type SetSessionModeRequest = z.output<typeof SetSessionModeRequestSchema>;

const SetSessionConfigOptionRequestSchema = z.union([
  z.looseObject({
    value: z.boolean(),
    type: z.literal("boolean"),
    sessionId: SessionIdSchema,
    configId: SessionConfigIdSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    value: SessionConfigValueIdSchema,
    sessionId: SessionIdSchema,
    configId: SessionConfigIdSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);

const SetSessionConfigOptionRequestOutboundSchema = z.union([
  z.strictObject({
    value: z.boolean(),
    type: z.literal("boolean"),
    sessionId: SessionIdOutboundSchema,
    configId: SessionConfigIdOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    value: SessionConfigValueIdOutboundSchema,
    sessionId: SessionIdOutboundSchema,
    configId: SessionConfigIdOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);

type SetSessionConfigOptionRequest = z.output<typeof SetSessionConfigOptionRequestSchema>;

const PromptRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  prompt: z.array(ContentBlockSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const PromptRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  prompt: z.array(ContentBlockOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type PromptRequest = z.output<typeof PromptRequestSchema>;

const WorkspaceFolderSchema = z.looseObject({
  uri: z.string(),
  name: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const WorkspaceFolderOutboundSchema = z.strictObject({
  uri: z.string(),
  name: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type WorkspaceFolder = z.output<typeof WorkspaceFolderSchema>;

const NesRepositorySchema = z.looseObject({
  name: z.string(),
  owner: z.string(),
  remoteUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesRepositoryOutboundSchema = z.strictObject({
  name: z.string(),
  owner: z.string(),
  remoteUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesRepository = z.output<typeof NesRepositorySchema>;

const StartNesRequestSchema = z.looseObject({
  workspaceUri: z.union([z.string(), z.null()]).optional(),
  workspaceFolders: z.union([z.array(WorkspaceFolderSchema), z.null()]).optional(),
  repository: z.union([NesRepositorySchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const StartNesRequestOutboundSchema = z.strictObject({
  workspaceUri: z.union([z.string(), z.null()]).optional(),
  workspaceFolders: z.union([z.array(WorkspaceFolderOutboundSchema), z.null()]).optional(),
  repository: z.union([NesRepositoryOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type StartNesRequest = z.output<typeof StartNesRequestSchema>;

const NesTriggerKindSchema = z.enum(["automatic", "diagnostic", "manual"]);

const NesTriggerKindOutboundSchema = z.enum(["automatic", "diagnostic", "manual"]);

type NesTriggerKind = z.output<typeof NesTriggerKindSchema>;

const NesRecentFileSchema = z.looseObject({
  uri: z.string(),
  languageId: z.string(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesRecentFileOutboundSchema = z.strictObject({
  uri: z.string(),
  languageId: z.string(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesRecentFile = z.output<typeof NesRecentFileSchema>;

const NesExcerptSchema = z.looseObject({
  startLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  endLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesExcerptOutboundSchema = z.strictObject({
  startLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  endLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesExcerpt = z.output<typeof NesExcerptSchema>;

const NesRelatedSnippetSchema = z.looseObject({
  uri: z.string(),
  excerpts: z.array(NesExcerptSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesRelatedSnippetOutboundSchema = z.strictObject({
  uri: z.string(),
  excerpts: z.array(NesExcerptOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesRelatedSnippet = z.output<typeof NesRelatedSnippetSchema>;

const NesEditHistoryEntrySchema = z.looseObject({
  uri: z.string(),
  diff: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesEditHistoryEntryOutboundSchema = z.strictObject({
  uri: z.string(),
  diff: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesEditHistoryEntry = z.output<typeof NesEditHistoryEntrySchema>;

const NesUserActionSchema = z.looseObject({
  action: z.string(),
  uri: z.string(),
  position: PositionSchema,
  timestampMs: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesUserActionOutboundSchema = z.strictObject({
  action: z.string(),
  uri: z.string(),
  position: PositionOutboundSchema,
  timestampMs: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesUserAction = z.output<typeof NesUserActionSchema>;

const NesOpenFileSchema = z.looseObject({
  uri: z.string(),
  languageId: z.string(),
  visibleRange: z.union([RangeSchema, z.null()]).optional(),
  lastFocusedMs: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesOpenFileOutboundSchema = z.strictObject({
  uri: z.string(),
  languageId: z.string(),
  visibleRange: z.union([RangeOutboundSchema, z.null()]).optional(),
  lastFocusedMs: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesOpenFile = z.output<typeof NesOpenFileSchema>;

export {
  NewSessionRequestSchema,
  NewSessionRequestOutboundSchema,
  type NewSessionRequest,
  LoadSessionRequestSchema,
  LoadSessionRequestOutboundSchema,
  type LoadSessionRequest,
  ListSessionsRequestSchema,
  ListSessionsRequestOutboundSchema,
  type ListSessionsRequest,
  DeleteSessionRequestSchema,
  DeleteSessionRequestOutboundSchema,
  type DeleteSessionRequest,
  ForkSessionRequestSchema,
  ForkSessionRequestOutboundSchema,
  type ForkSessionRequest,
  ResumeSessionRequestSchema,
  ResumeSessionRequestOutboundSchema,
  type ResumeSessionRequest,
  CloseSessionRequestSchema,
  CloseSessionRequestOutboundSchema,
  type CloseSessionRequest,
  SetSessionModeRequestSchema,
  SetSessionModeRequestOutboundSchema,
  type SetSessionModeRequest,
  SetSessionConfigOptionRequestSchema,
  SetSessionConfigOptionRequestOutboundSchema,
  type SetSessionConfigOptionRequest,
  PromptRequestSchema,
  PromptRequestOutboundSchema,
  type PromptRequest,
  WorkspaceFolderSchema,
  WorkspaceFolderOutboundSchema,
  type WorkspaceFolder,
  NesRepositorySchema,
  NesRepositoryOutboundSchema,
  type NesRepository,
  StartNesRequestSchema,
  StartNesRequestOutboundSchema,
  type StartNesRequest,
  NesTriggerKindSchema,
  NesTriggerKindOutboundSchema,
  type NesTriggerKind,
  NesRecentFileSchema,
  NesRecentFileOutboundSchema,
  type NesRecentFile,
  NesExcerptSchema,
  NesExcerptOutboundSchema,
  type NesExcerpt,
  NesRelatedSnippetSchema,
  NesRelatedSnippetOutboundSchema,
  type NesRelatedSnippet,
  NesEditHistoryEntrySchema,
  NesEditHistoryEntryOutboundSchema,
  type NesEditHistoryEntry,
  NesUserActionSchema,
  NesUserActionOutboundSchema,
  type NesUserAction,
  NesOpenFileSchema,
  NesOpenFileOutboundSchema,
  type NesOpenFile,
};
