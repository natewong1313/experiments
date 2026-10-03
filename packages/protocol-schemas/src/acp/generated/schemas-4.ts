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

const NesRecentFilesCapabilitiesSchema = z.looseObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesRecentFilesCapabilitiesOutboundSchema = z.strictObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesRecentFilesCapabilities = z.output<typeof NesRecentFilesCapabilitiesSchema>;

const NesRelatedSnippetsCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesRelatedSnippetsCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesRelatedSnippetsCapabilities = z.output<typeof NesRelatedSnippetsCapabilitiesSchema>;

const NesEditHistoryCapabilitiesSchema = z.looseObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesEditHistoryCapabilitiesOutboundSchema = z.strictObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesEditHistoryCapabilities = z.output<typeof NesEditHistoryCapabilitiesSchema>;

const NesUserActionsCapabilitiesSchema = z.looseObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesUserActionsCapabilitiesOutboundSchema = z.strictObject({
  maxCount: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesUserActionsCapabilities = z.output<typeof NesUserActionsCapabilitiesSchema>;

const NesOpenFilesCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesOpenFilesCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesOpenFilesCapabilities = z.output<typeof NesOpenFilesCapabilitiesSchema>;

const NesDiagnosticsCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesDiagnosticsCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesDiagnosticsCapabilities = z.output<typeof NesDiagnosticsCapabilitiesSchema>;

const NesContextCapabilitiesSchema = z.looseObject({
  recentFiles: z.union([NesRecentFilesCapabilitiesSchema, z.null()]).optional(),
  relatedSnippets: z.union([NesRelatedSnippetsCapabilitiesSchema, z.null()]).optional(),
  editHistory: z.union([NesEditHistoryCapabilitiesSchema, z.null()]).optional(),
  userActions: z.union([NesUserActionsCapabilitiesSchema, z.null()]).optional(),
  openFiles: z.union([NesOpenFilesCapabilitiesSchema, z.null()]).optional(),
  diagnostics: z.union([NesDiagnosticsCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesContextCapabilitiesOutboundSchema = z.strictObject({
  recentFiles: z.union([NesRecentFilesCapabilitiesOutboundSchema, z.null()]).optional(),
  relatedSnippets: z.union([NesRelatedSnippetsCapabilitiesOutboundSchema, z.null()]).optional(),
  editHistory: z.union([NesEditHistoryCapabilitiesOutboundSchema, z.null()]).optional(),
  userActions: z.union([NesUserActionsCapabilitiesOutboundSchema, z.null()]).optional(),
  openFiles: z.union([NesOpenFilesCapabilitiesOutboundSchema, z.null()]).optional(),
  diagnostics: z.union([NesDiagnosticsCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesContextCapabilities = z.output<typeof NesContextCapabilitiesSchema>;

const NesCapabilitiesSchema = z.looseObject({
  events: z.union([NesEventCapabilitiesSchema, z.null()]).optional(),
  context: z.union([NesContextCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesCapabilitiesOutboundSchema = z.strictObject({
  events: z.union([NesEventCapabilitiesOutboundSchema, z.null()]).optional(),
  context: z.union([NesContextCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesCapabilities = z.output<typeof NesCapabilitiesSchema>;

const PositionEncodingKindSchema = z.enum(["utf-16", "utf-32", "utf-8"]);

const PositionEncodingKindOutboundSchema = z.enum(["utf-16", "utf-32", "utf-8"]);

type PositionEncodingKind = z.output<typeof PositionEncodingKindSchema>;

const AgentCapabilitiesSchema = z.looseObject({
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

const AgentCapabilitiesOutboundSchema = z.strictObject({
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

type AgentCapabilities = z.output<typeof AgentCapabilitiesSchema>;

const AuthMethodIdSchema = z.string();

const AuthMethodIdOutboundSchema = z.string();

type AuthMethodId = z.output<typeof AuthMethodIdSchema>;

const AuthMethodTerminalSchema = z.looseObject({
  id: AuthMethodIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const AuthMethodTerminalOutboundSchema = z.strictObject({
  id: AuthMethodIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type AuthMethodTerminal = z.output<typeof AuthMethodTerminalSchema>;

const AuthMethodAgentSchema = z.looseObject({
  id: AuthMethodIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const AuthMethodAgentOutboundSchema = z.strictObject({
  id: AuthMethodIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type AuthMethodAgent = z.output<typeof AuthMethodAgentSchema>;

const AuthMethodSchema = z.union([
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

const AuthMethodOutboundSchema = z.union([
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

type AuthMethod = z.output<typeof AuthMethodSchema>;

const ImplementationSchema = z.looseObject({
  name: z.string(),
  title: z.union([z.string(), z.null()]).optional(),
  version: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ImplementationOutboundSchema = z.strictObject({
  name: z.string(),
  title: z.union([z.string(), z.null()]).optional(),
  version: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type Implementation = z.output<typeof ImplementationSchema>;

const InitializeResponseSchema = z.looseObject({
  protocolVersion: ProtocolVersionSchema,
  agentCapabilities: AgentCapabilitiesSchema.optional(),
  authMethods: z.array(AuthMethodSchema).optional(),
  agentInfo: z.union([ImplementationSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const InitializeResponseOutboundSchema = z.strictObject({
  protocolVersion: ProtocolVersionOutboundSchema,
  agentCapabilities: AgentCapabilitiesOutboundSchema.optional(),
  authMethods: z.array(AuthMethodOutboundSchema).optional(),
  agentInfo: z.union([ImplementationOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type InitializeResponse = z.output<typeof InitializeResponseSchema>;

const AuthenticateResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const AuthenticateResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type AuthenticateResponse = z.output<typeof AuthenticateResponseSchema>;

const ProviderIdSchema = z.string();

const ProviderIdOutboundSchema = z.string();

type ProviderId = z.output<typeof ProviderIdSchema>;

const LlmProtocolSchema = z.union([
  z.literal("anthropic"),
  z.literal("openai"),
  z.literal("azure"),
  z.literal("vertex"),
  z.literal("bedrock"),
  z.string(),
]);

const LlmProtocolOutboundSchema = z.union([
  z.literal("anthropic"),
  z.literal("openai"),
  z.literal("azure"),
  z.literal("vertex"),
  z.literal("bedrock"),
  z.string(),
]);

type LlmProtocol = z.output<typeof LlmProtocolSchema>;

const ProviderCurrentConfigSchema = z.looseObject({
  apiType: LlmProtocolSchema,
  baseUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ProviderCurrentConfigOutboundSchema = z.strictObject({
  apiType: LlmProtocolOutboundSchema,
  baseUrl: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type ProviderCurrentConfig = z.output<typeof ProviderCurrentConfigSchema>;

export {
  NesRecentFilesCapabilitiesSchema,
  NesRecentFilesCapabilitiesOutboundSchema,
  type NesRecentFilesCapabilities,
  NesRelatedSnippetsCapabilitiesSchema,
  NesRelatedSnippetsCapabilitiesOutboundSchema,
  type NesRelatedSnippetsCapabilities,
  NesEditHistoryCapabilitiesSchema,
  NesEditHistoryCapabilitiesOutboundSchema,
  type NesEditHistoryCapabilities,
  NesUserActionsCapabilitiesSchema,
  NesUserActionsCapabilitiesOutboundSchema,
  type NesUserActionsCapabilities,
  NesOpenFilesCapabilitiesSchema,
  NesOpenFilesCapabilitiesOutboundSchema,
  type NesOpenFilesCapabilities,
  NesDiagnosticsCapabilitiesSchema,
  NesDiagnosticsCapabilitiesOutboundSchema,
  type NesDiagnosticsCapabilities,
  NesContextCapabilitiesSchema,
  NesContextCapabilitiesOutboundSchema,
  type NesContextCapabilities,
  NesCapabilitiesSchema,
  NesCapabilitiesOutboundSchema,
  type NesCapabilities,
  PositionEncodingKindSchema,
  PositionEncodingKindOutboundSchema,
  type PositionEncodingKind,
  AgentCapabilitiesSchema,
  AgentCapabilitiesOutboundSchema,
  type AgentCapabilities,
  AuthMethodIdSchema,
  AuthMethodIdOutboundSchema,
  type AuthMethodId,
  AuthMethodTerminalSchema,
  AuthMethodTerminalOutboundSchema,
  type AuthMethodTerminal,
  AuthMethodAgentSchema,
  AuthMethodAgentOutboundSchema,
  type AuthMethodAgent,
  AuthMethodSchema,
  AuthMethodOutboundSchema,
  type AuthMethod,
  ImplementationSchema,
  ImplementationOutboundSchema,
  type Implementation,
  InitializeResponseSchema,
  InitializeResponseOutboundSchema,
  type InitializeResponse,
  AuthenticateResponseSchema,
  AuthenticateResponseOutboundSchema,
  type AuthenticateResponse,
  ProviderIdSchema,
  ProviderIdOutboundSchema,
  type ProviderId,
  LlmProtocolSchema,
  LlmProtocolOutboundSchema,
  type LlmProtocol,
  ProviderCurrentConfigSchema,
  ProviderCurrentConfigOutboundSchema,
  type ProviderCurrentConfig,
};
