// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { EnvVariableSchema, EnvVariableOutboundSchema } from "./schemas-1";
import {
  McpServerAcpIdSchema,
  McpServerAcpIdOutboundSchema,
  ProtocolVersionSchema,
  ProtocolVersionOutboundSchema,
} from "./schemas-2";
import {
  PositionEncodingKindSchema,
  PositionEncodingKindOutboundSchema,
  AuthMethodIdSchema,
  AuthMethodIdOutboundSchema,
  ImplementationSchema,
  ImplementationOutboundSchema,
  ProviderIdSchema,
  ProviderIdOutboundSchema,
  LlmProtocolSchema,
  LlmProtocolOutboundSchema,
} from "./schemas-4";
import {
  FileSystemCapabilitiesSchema,
  FileSystemCapabilitiesOutboundSchema,
  ClientSessionCapabilitiesSchema,
  ClientSessionCapabilitiesOutboundSchema,
  SubagentCapabilitiesSchema,
  SubagentCapabilitiesOutboundSchema,
  PlanCapabilitiesSchema,
  PlanCapabilitiesOutboundSchema,
  AuthCapabilitiesSchema,
  AuthCapabilitiesOutboundSchema,
} from "./schemas-9";

export const ElicitationFormCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ElicitationFormCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ElicitationFormCapabilities = z.output<typeof ElicitationFormCapabilitiesSchema>;

export const ElicitationUrlCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ElicitationUrlCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ElicitationUrlCapabilities = z.output<typeof ElicitationUrlCapabilitiesSchema>;

export const ElicitationCapabilitiesSchema = z.looseObject({
  form: z.union([ElicitationFormCapabilitiesSchema, z.null()]).optional(),
  url: z.union([ElicitationUrlCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ElicitationCapabilitiesOutboundSchema = z.strictObject({
  form: z.union([ElicitationFormCapabilitiesOutboundSchema, z.null()]).optional(),
  url: z.union([ElicitationUrlCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ElicitationCapabilities = z.output<typeof ElicitationCapabilitiesSchema>;

export const NesJumpCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesJumpCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesJumpCapabilities = z.output<typeof NesJumpCapabilitiesSchema>;

export const NesRenameCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesRenameCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesRenameCapabilities = z.output<typeof NesRenameCapabilitiesSchema>;

export const NesSearchAndReplaceCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesSearchAndReplaceCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesSearchAndReplaceCapabilities = z.output<
  typeof NesSearchAndReplaceCapabilitiesSchema
>;

export const ClientNesCapabilitiesSchema = z.looseObject({
  jump: z.union([NesJumpCapabilitiesSchema, z.null()]).optional(),
  rename: z.union([NesRenameCapabilitiesSchema, z.null()]).optional(),
  searchAndReplace: z.union([NesSearchAndReplaceCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ClientNesCapabilitiesOutboundSchema = z.strictObject({
  jump: z.union([NesJumpCapabilitiesOutboundSchema, z.null()]).optional(),
  rename: z.union([NesRenameCapabilitiesOutboundSchema, z.null()]).optional(),
  searchAndReplace: z.union([NesSearchAndReplaceCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ClientNesCapabilities = z.output<typeof ClientNesCapabilitiesSchema>;

export const ClientCapabilitiesSchema = z.looseObject({
  fs: FileSystemCapabilitiesSchema.optional(),
  terminal: z.boolean().optional(),
  session: z.union([ClientSessionCapabilitiesSchema, z.null()]).optional(),
  subagents: z.union([SubagentCapabilitiesSchema, z.null()]).optional(),
  plan: z.union([PlanCapabilitiesSchema, z.null()]).optional(),
  auth: AuthCapabilitiesSchema.optional(),
  elicitation: z.union([ElicitationCapabilitiesSchema, z.null()]).optional(),
  nes: z.union([ClientNesCapabilitiesSchema, z.null()]).optional(),
  positionEncodings: z.array(PositionEncodingKindSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ClientCapabilitiesOutboundSchema = z.strictObject({
  fs: FileSystemCapabilitiesOutboundSchema.optional(),
  terminal: z.boolean().optional(),
  session: z.union([ClientSessionCapabilitiesOutboundSchema, z.null()]).optional(),
  subagents: z.union([SubagentCapabilitiesOutboundSchema, z.null()]).optional(),
  plan: z.union([PlanCapabilitiesOutboundSchema, z.null()]).optional(),
  auth: AuthCapabilitiesOutboundSchema.optional(),
  elicitation: z.union([ElicitationCapabilitiesOutboundSchema, z.null()]).optional(),
  nes: z.union([ClientNesCapabilitiesOutboundSchema, z.null()]).optional(),
  positionEncodings: z.array(PositionEncodingKindOutboundSchema).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ClientCapabilities = z.output<typeof ClientCapabilitiesSchema>;

export const InitializeRequestSchema = z.looseObject({
  protocolVersion: ProtocolVersionSchema,
  clientCapabilities: ClientCapabilitiesSchema.optional(),
  clientInfo: z.union([ImplementationSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const InitializeRequestOutboundSchema = z.strictObject({
  protocolVersion: ProtocolVersionOutboundSchema,
  clientCapabilities: ClientCapabilitiesOutboundSchema.optional(),
  clientInfo: z.union([ImplementationOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type InitializeRequest = z.output<typeof InitializeRequestSchema>;

export const AuthenticateRequestSchema = z.looseObject({
  methodId: AuthMethodIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AuthenticateRequestOutboundSchema = z.strictObject({
  methodId: AuthMethodIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AuthenticateRequest = z.output<typeof AuthenticateRequestSchema>;

export const ListProvidersRequestSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ListProvidersRequestOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ListProvidersRequest = z.output<typeof ListProvidersRequestSchema>;

export const SetProviderRequestSchema = z.looseObject({
  providerId: ProviderIdSchema,
  apiType: LlmProtocolSchema,
  baseUrl: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SetProviderRequestOutboundSchema = z.strictObject({
  providerId: ProviderIdOutboundSchema,
  apiType: LlmProtocolOutboundSchema,
  baseUrl: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SetProviderRequest = z.output<typeof SetProviderRequestSchema>;

export const DisableProviderRequestSchema = z.looseObject({
  providerId: ProviderIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DisableProviderRequestOutboundSchema = z.strictObject({
  providerId: ProviderIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DisableProviderRequest = z.output<typeof DisableProviderRequestSchema>;

export const LogoutRequestSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const LogoutRequestOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type LogoutRequest = z.output<typeof LogoutRequestSchema>;

export const HttpHeaderSchema = z.looseObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const HttpHeaderOutboundSchema = z.strictObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type HttpHeader = z.output<typeof HttpHeaderSchema>;

export const McpServerHttpSchema = z.looseObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const McpServerHttpOutboundSchema = z.strictObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type McpServerHttp = z.output<typeof McpServerHttpSchema>;

export const McpServerSseSchema = z.looseObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const McpServerSseOutboundSchema = z.strictObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type McpServerSse = z.output<typeof McpServerSseSchema>;

export const McpServerAcpSchema = z.looseObject({
  name: z.string(),
  serverId: McpServerAcpIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const McpServerAcpOutboundSchema = z.strictObject({
  name: z.string(),
  serverId: McpServerAcpIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type McpServerAcp = z.output<typeof McpServerAcpSchema>;

export const McpServerStdioSchema = z.looseObject({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.array(EnvVariableSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const McpServerStdioOutboundSchema = z.strictObject({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.array(EnvVariableOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type McpServerStdio = z.output<typeof McpServerStdioSchema>;

export const McpServerSchema = z.union([
  z.looseObject({
    name: z.string(),
    url: z.string(),
    headers: z.array(HttpHeaderSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("http"),
  }),
  z.looseObject({
    name: z.string(),
    url: z.string(),
    headers: z.array(HttpHeaderSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("sse"),
  }),
  z.looseObject({
    name: z.string(),
    serverId: McpServerAcpIdSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("acp"),
  }),
  McpServerStdioSchema,
]);

export const McpServerOutboundSchema = z.union([
  z.strictObject({
    name: z.string(),
    url: z.string(),
    headers: z.array(HttpHeaderOutboundSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("http"),
  }),
  z.strictObject({
    name: z.string(),
    url: z.string(),
    headers: z.array(HttpHeaderOutboundSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("sse"),
  }),
  z.strictObject({
    name: z.string(),
    serverId: McpServerAcpIdOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("acp"),
  }),
  McpServerStdioOutboundSchema,
]);

export type McpServer = z.output<typeof McpServerSchema>;
