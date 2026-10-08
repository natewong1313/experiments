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

export const NewSessionRequestSchema = z.looseObject({
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NewSessionRequestOutboundSchema = z.strictObject({
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NewSessionRequest = z.output<typeof NewSessionRequestSchema>;

export const LoadSessionRequestSchema = z.looseObject({
  mcpServers: z.array(McpServerSchema),
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const LoadSessionRequestOutboundSchema = z.strictObject({
  mcpServers: z.array(McpServerOutboundSchema),
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type LoadSessionRequest = z.output<typeof LoadSessionRequestSchema>;

export const ListSessionsRequestSchema = z.looseObject({
  cwd: z.union([z.string(), z.null()]).optional(),
  cursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ListSessionsRequestOutboundSchema = z.strictObject({
  cwd: z.union([z.string(), z.null()]).optional(),
  cursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ListSessionsRequest = z.output<typeof ListSessionsRequestSchema>;

export const DeleteSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DeleteSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DeleteSessionRequest = z.output<typeof DeleteSessionRequestSchema>;

export const ForkSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ForkSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerOutboundSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ForkSessionRequest = z.output<typeof ForkSessionRequestSchema>;

export const ResumeSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ResumeSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  mcpServers: z.array(McpServerOutboundSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ResumeSessionRequest = z.output<typeof ResumeSessionRequestSchema>;

export const CloseSessionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CloseSessionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CloseSessionRequest = z.output<typeof CloseSessionRequestSchema>;

export const SetSessionModeRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  modeId: SessionModeIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SetSessionModeRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  modeId: SessionModeIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SetSessionModeRequest = z.output<typeof SetSessionModeRequestSchema>;

export const SetSessionConfigOptionRequestSchema = z.union([
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

export const SetSessionConfigOptionRequestOutboundSchema = z.union([
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

export type SetSessionConfigOptionRequest = z.output<typeof SetSessionConfigOptionRequestSchema>;

export const PromptRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  prompt: z.array(ContentBlockSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PromptRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  prompt: z.array(ContentBlockOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PromptRequest = z.output<typeof PromptRequestSchema>;

export const WorkspaceFolderSchema = z.looseObject({
  uri: z.string(),
  name: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const WorkspaceFolderOutboundSchema = z.strictObject({
  uri: z.string(),
  name: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type WorkspaceFolder = z.output<typeof WorkspaceFolderSchema>;

export const NesRepositorySchema = z.looseObject({
  name: z.string(),
  owner: z.string(),
  remoteUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesRepositoryOutboundSchema = z.strictObject({
  name: z.string(),
  owner: z.string(),
  remoteUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesRepository = z.output<typeof NesRepositorySchema>;

export const StartNesRequestSchema = z.looseObject({
  workspaceUri: z.union([z.string(), z.null()]).optional(),
  workspaceFolders: z.union([z.array(WorkspaceFolderSchema), z.null()]).optional(),
  repository: z.union([NesRepositorySchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const StartNesRequestOutboundSchema = z.strictObject({
  workspaceUri: z.union([z.string(), z.null()]).optional(),
  workspaceFolders: z.union([z.array(WorkspaceFolderOutboundSchema), z.null()]).optional(),
  repository: z.union([NesRepositoryOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type StartNesRequest = z.output<typeof StartNesRequestSchema>;

export const NesTriggerKindSchema = z.enum(["automatic", "diagnostic", "manual"]);

export const NesTriggerKindOutboundSchema = z.enum(["automatic", "diagnostic", "manual"]);

export type NesTriggerKind = z.output<typeof NesTriggerKindSchema>;

export const NesRecentFileSchema = z.looseObject({
  uri: z.string(),
  languageId: z.string(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesRecentFileOutboundSchema = z.strictObject({
  uri: z.string(),
  languageId: z.string(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesRecentFile = z.output<typeof NesRecentFileSchema>;

export const NesExcerptSchema = z.looseObject({
  startLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  endLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesExcerptOutboundSchema = z.strictObject({
  startLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  endLine: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesExcerpt = z.output<typeof NesExcerptSchema>;

export const NesRelatedSnippetSchema = z.looseObject({
  uri: z.string(),
  excerpts: z.array(NesExcerptSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesRelatedSnippetOutboundSchema = z.strictObject({
  uri: z.string(),
  excerpts: z.array(NesExcerptOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesRelatedSnippet = z.output<typeof NesRelatedSnippetSchema>;

export const NesEditHistoryEntrySchema = z.looseObject({
  uri: z.string(),
  diff: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesEditHistoryEntryOutboundSchema = z.strictObject({
  uri: z.string(),
  diff: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesEditHistoryEntry = z.output<typeof NesEditHistoryEntrySchema>;

export const NesUserActionSchema = z.looseObject({
  action: z.string(),
  uri: z.string(),
  position: PositionSchema,
  timestampMs: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesUserActionOutboundSchema = z.strictObject({
  action: z.string(),
  uri: z.string(),
  position: PositionOutboundSchema,
  timestampMs: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesUserAction = z.output<typeof NesUserActionSchema>;

export const NesOpenFileSchema = z.looseObject({
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

export const NesOpenFileOutboundSchema = z.strictObject({
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

export type NesOpenFile = z.output<typeof NesOpenFileSchema>;
