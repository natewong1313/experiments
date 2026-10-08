// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { ProtocolVersionSchema, ProtocolVersionOutboundSchema } from "./schemas-2";
import {
  PromptCapabilitiesSchema,
  PromptCapabilitiesOutboundSchema,
  McpCapabilitiesSchema,
  McpCapabilitiesOutboundSchema,
  SessionCapabilitiesSchema,
  SessionCapabilitiesOutboundSchema,
  AgentAuthCapabilitiesSchema,
  AgentAuthCapabilitiesOutboundSchema,
  ProvidersCapabilitiesSchema,
  ProvidersCapabilitiesOutboundSchema,
  NesEventCapabilitiesSchema,
  NesEventCapabilitiesOutboundSchema,
} from "./schemas-3";

export const NesRecentFilesCapabilitiesSchema = z.looseObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesRecentFilesCapabilitiesOutboundSchema = z.strictObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesRecentFilesCapabilities = z.output<typeof NesRecentFilesCapabilitiesSchema>;

export const NesRelatedSnippetsCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesRelatedSnippetsCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesRelatedSnippetsCapabilities = z.output<typeof NesRelatedSnippetsCapabilitiesSchema>;

export const NesEditHistoryCapabilitiesSchema = z.looseObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesEditHistoryCapabilitiesOutboundSchema = z.strictObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesEditHistoryCapabilities = z.output<typeof NesEditHistoryCapabilitiesSchema>;

export const NesUserActionsCapabilitiesSchema = z.looseObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesUserActionsCapabilitiesOutboundSchema = z.strictObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesUserActionsCapabilities = z.output<typeof NesUserActionsCapabilitiesSchema>;

export const NesOpenFilesCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesOpenFilesCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesOpenFilesCapabilities = z.output<typeof NesOpenFilesCapabilitiesSchema>;

export const NesDiagnosticsCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesDiagnosticsCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesDiagnosticsCapabilities = z.output<typeof NesDiagnosticsCapabilitiesSchema>;

export const NesContextCapabilitiesSchema = z.looseObject({
  recentFiles: z.union([NesRecentFilesCapabilitiesSchema, z.null()]).optional(),
  relatedSnippets: z.union([NesRelatedSnippetsCapabilitiesSchema, z.null()]).optional(),
  editHistory: z.union([NesEditHistoryCapabilitiesSchema, z.null()]).optional(),
  userActions: z.union([NesUserActionsCapabilitiesSchema, z.null()]).optional(),
  openFiles: z.union([NesOpenFilesCapabilitiesSchema, z.null()]).optional(),
  diagnostics: z.union([NesDiagnosticsCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesContextCapabilitiesOutboundSchema = z.strictObject({
  recentFiles: z.union([NesRecentFilesCapabilitiesOutboundSchema, z.null()]).optional(),
  relatedSnippets: z.union([NesRelatedSnippetsCapabilitiesOutboundSchema, z.null()]).optional(),
  editHistory: z.union([NesEditHistoryCapabilitiesOutboundSchema, z.null()]).optional(),
  userActions: z.union([NesUserActionsCapabilitiesOutboundSchema, z.null()]).optional(),
  openFiles: z.union([NesOpenFilesCapabilitiesOutboundSchema, z.null()]).optional(),
  diagnostics: z.union([NesDiagnosticsCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesContextCapabilities = z.output<typeof NesContextCapabilitiesSchema>;

export const NesCapabilitiesSchema = z.looseObject({
  events: z.union([NesEventCapabilitiesSchema, z.null()]).optional(),
  context: z.union([NesContextCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesCapabilitiesOutboundSchema = z.strictObject({
  events: z.union([NesEventCapabilitiesOutboundSchema, z.null()]).optional(),
  context: z.union([NesContextCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesCapabilities = z.output<typeof NesCapabilitiesSchema>;

export const PositionEncodingKindSchema = z.enum(["utf-16", "utf-32", "utf-8"]);

export const PositionEncodingKindOutboundSchema = z.enum(["utf-16", "utf-32", "utf-8"]);

export type PositionEncodingKind = z.output<typeof PositionEncodingKindSchema>;

export const AgentCapabilitiesSchema = z.looseObject({
  loadSession: z.boolean().optional(),
  promptCapabilities: PromptCapabilitiesSchema.optional(),
  mcpCapabilities: McpCapabilitiesSchema.optional(),
  sessionCapabilities: SessionCapabilitiesSchema.optional(),
  auth: AgentAuthCapabilitiesSchema.optional(),
  providers: z.union([ProvidersCapabilitiesSchema, z.null()]).optional(),
  nes: z.union([NesCapabilitiesSchema, z.null()]).optional(),
  positionEncoding: z.union([PositionEncodingKindSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AgentCapabilitiesOutboundSchema = z.strictObject({
  loadSession: z.boolean().optional(),
  promptCapabilities: PromptCapabilitiesOutboundSchema.optional(),
  mcpCapabilities: McpCapabilitiesOutboundSchema.optional(),
  sessionCapabilities: SessionCapabilitiesOutboundSchema.optional(),
  auth: AgentAuthCapabilitiesOutboundSchema.optional(),
  providers: z.union([ProvidersCapabilitiesOutboundSchema, z.null()]).optional(),
  nes: z.union([NesCapabilitiesOutboundSchema, z.null()]).optional(),
  positionEncoding: z.union([PositionEncodingKindOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AgentCapabilities = z.output<typeof AgentCapabilitiesSchema>;

export const AuthMethodIdSchema = z.string();

export const AuthMethodIdOutboundSchema = z.string();

export type AuthMethodId = z.output<typeof AuthMethodIdSchema>;

export const AuthMethodTerminalSchema = z.looseObject({
  id: AuthMethodIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AuthMethodTerminalOutboundSchema = z.strictObject({
  id: AuthMethodIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AuthMethodTerminal = z.output<typeof AuthMethodTerminalSchema>;

export const AuthMethodAgentSchema = z.looseObject({
  id: AuthMethodIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AuthMethodAgentOutboundSchema = z.strictObject({
  id: AuthMethodIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AuthMethodAgent = z.output<typeof AuthMethodAgentSchema>;

export const AuthMethodSchema = z.union([
  z.looseObject({
    id: AuthMethodIdSchema,
    name: z.string(),
    description: z.union([z.string(), z.null()]).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("terminal"),
  }),
  AuthMethodAgentSchema,
]);

export const AuthMethodOutboundSchema = z.union([
  z.strictObject({
    id: AuthMethodIdOutboundSchema,
    name: z.string(),
    description: z.union([z.string(), z.null()]).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("terminal"),
  }),
  AuthMethodAgentOutboundSchema,
]);

export type AuthMethod = z.output<typeof AuthMethodSchema>;

export const ImplementationSchema = z.looseObject({
  name: z.string(),
  title: z.union([z.string(), z.null()]).optional(),
  version: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ImplementationOutboundSchema = z.strictObject({
  name: z.string(),
  title: z.union([z.string(), z.null()]).optional(),
  version: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Implementation = z.output<typeof ImplementationSchema>;

export const InitializeResponseSchema = z.looseObject({
  protocolVersion: ProtocolVersionSchema,
  agentCapabilities: AgentCapabilitiesSchema.optional(),
  authMethods: z.array(AuthMethodSchema).optional(),
  agentInfo: z.union([ImplementationSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const InitializeResponseOutboundSchema = z.strictObject({
  protocolVersion: ProtocolVersionOutboundSchema,
  agentCapabilities: AgentCapabilitiesOutboundSchema.optional(),
  authMethods: z.array(AuthMethodOutboundSchema).optional(),
  agentInfo: z.union([ImplementationOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type InitializeResponse = z.output<typeof InitializeResponseSchema>;

export const AuthenticateResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AuthenticateResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AuthenticateResponse = z.output<typeof AuthenticateResponseSchema>;

export const ProviderIdSchema = z.string();

export const ProviderIdOutboundSchema = z.string();

export type ProviderId = z.output<typeof ProviderIdSchema>;

export const LlmProtocolSchema = z.union([
  z.literal("anthropic"),
  z.literal("openai"),
  z.literal("azure"),
  z.literal("vertex"),
  z.literal("bedrock"),
  z.string(),
]);

export const LlmProtocolOutboundSchema = z.union([
  z.literal("anthropic"),
  z.literal("openai"),
  z.literal("azure"),
  z.literal("vertex"),
  z.literal("bedrock"),
  z.string(),
]);

export type LlmProtocol = z.output<typeof LlmProtocolSchema>;

export const ProviderCurrentConfigSchema = z.looseObject({
  apiType: LlmProtocolSchema,
  baseUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ProviderCurrentConfigOutboundSchema = z.strictObject({
  apiType: LlmProtocolOutboundSchema,
  baseUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ProviderCurrentConfig = z.output<typeof ProviderCurrentConfigSchema>;
