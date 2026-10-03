// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { EnvVariableSchema, EnvVariableOutboundSchema } from "./schemas-1";
import { McpServerAcpIdSchema, McpServerAcpIdOutboundSchema } from "./schemas-2";
import { ProtocolVersionSchema, ProtocolVersionOutboundSchema } from "./schemas-2";
import { PositionEncodingKindSchema, PositionEncodingKindOutboundSchema } from "./schemas-4";
import { AuthMethodIdSchema, AuthMethodIdOutboundSchema } from "./schemas-4";
import { ImplementationSchema, ImplementationOutboundSchema } from "./schemas-4";
import { ProviderIdSchema, ProviderIdOutboundSchema } from "./schemas-4";
import { LlmProtocolSchema, LlmProtocolOutboundSchema } from "./schemas-4";
import { FileSystemCapabilitiesSchema, FileSystemCapabilitiesOutboundSchema } from "./schemas-9";
import {
  ClientSessionCapabilitiesSchema,
  ClientSessionCapabilitiesOutboundSchema,
} from "./schemas-9";
import { SubagentCapabilitiesSchema, SubagentCapabilitiesOutboundSchema } from "./schemas-9";
import { PlanCapabilitiesSchema, PlanCapabilitiesOutboundSchema } from "./schemas-9";
import { AuthCapabilitiesSchema, AuthCapabilitiesOutboundSchema } from "./schemas-9";
const ElicitationFormCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ElicitationFormCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ElicitationFormCapabilities = z.output<typeof ElicitationFormCapabilitiesSchema>;
const ElicitationUrlCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ElicitationUrlCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ElicitationUrlCapabilities = z.output<typeof ElicitationUrlCapabilitiesSchema>;
const ElicitationCapabilitiesSchema = z.looseObject({
  form: z.union([ElicitationFormCapabilitiesSchema, z.null()]).optional(),
  url: z.union([ElicitationUrlCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ElicitationCapabilitiesOutboundSchema = z.strictObject({
  form: z.union([ElicitationFormCapabilitiesOutboundSchema, z.null()]).optional(),
  url: z.union([ElicitationUrlCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ElicitationCapabilities = z.output<typeof ElicitationCapabilitiesSchema>;
const NesJumpCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesJumpCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesJumpCapabilities = z.output<typeof NesJumpCapabilitiesSchema>;
const NesRenameCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesRenameCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesRenameCapabilities = z.output<typeof NesRenameCapabilitiesSchema>;
const NesSearchAndReplaceCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesSearchAndReplaceCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesSearchAndReplaceCapabilities = z.output<typeof NesSearchAndReplaceCapabilitiesSchema>;
const ClientNesCapabilitiesSchema = z.looseObject({
  jump: z.union([NesJumpCapabilitiesSchema, z.null()]).optional(),
  rename: z.union([NesRenameCapabilitiesSchema, z.null()]).optional(),
  searchAndReplace: z.union([NesSearchAndReplaceCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ClientNesCapabilitiesOutboundSchema = z.strictObject({
  jump: z.union([NesJumpCapabilitiesOutboundSchema, z.null()]).optional(),
  rename: z.union([NesRenameCapabilitiesOutboundSchema, z.null()]).optional(),
  searchAndReplace: z.union([NesSearchAndReplaceCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ClientNesCapabilities = z.output<typeof ClientNesCapabilitiesSchema>;
const ClientCapabilitiesSchema = z.looseObject({
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
const ClientCapabilitiesOutboundSchema = z.strictObject({
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
type ClientCapabilities = z.output<typeof ClientCapabilitiesSchema>;
const InitializeRequestSchema = z.looseObject({
  protocolVersion: ProtocolVersionSchema,
  clientCapabilities: ClientCapabilitiesSchema.optional(),
  clientInfo: z.union([ImplementationSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const InitializeRequestOutboundSchema = z.strictObject({
  protocolVersion: ProtocolVersionOutboundSchema,
  clientCapabilities: ClientCapabilitiesOutboundSchema.optional(),
  clientInfo: z.union([ImplementationOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type InitializeRequest = z.output<typeof InitializeRequestSchema>;
const AuthenticateRequestSchema = z.looseObject({
  methodId: AuthMethodIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AuthenticateRequestOutboundSchema = z.strictObject({
  methodId: AuthMethodIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type AuthenticateRequest = z.output<typeof AuthenticateRequestSchema>;
const ListProvidersRequestSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ListProvidersRequestOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ListProvidersRequest = z.output<typeof ListProvidersRequestSchema>;
const SetProviderRequestSchema = z.looseObject({
  providerId: ProviderIdSchema,
  apiType: LlmProtocolSchema,
  baseUrl: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SetProviderRequestOutboundSchema = z.strictObject({
  providerId: ProviderIdOutboundSchema,
  apiType: LlmProtocolOutboundSchema,
  baseUrl: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SetProviderRequest = z.output<typeof SetProviderRequestSchema>;
const DisableProviderRequestSchema = z.looseObject({
  providerId: ProviderIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DisableProviderRequestOutboundSchema = z.strictObject({
  providerId: ProviderIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type DisableProviderRequest = z.output<typeof DisableProviderRequestSchema>;
const LogoutRequestSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const LogoutRequestOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type LogoutRequest = z.output<typeof LogoutRequestSchema>;
const HttpHeaderSchema = z.looseObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const HttpHeaderOutboundSchema = z.strictObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type HttpHeader = z.output<typeof HttpHeaderSchema>;
const McpServerHttpSchema = z.looseObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const McpServerHttpOutboundSchema = z.strictObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type McpServerHttp = z.output<typeof McpServerHttpSchema>;
const McpServerSseSchema = z.looseObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const McpServerSseOutboundSchema = z.strictObject({
  name: z.string(),
  url: z.string(),
  headers: z.array(HttpHeaderOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type McpServerSse = z.output<typeof McpServerSseSchema>;
const McpServerAcpSchema = z.looseObject({
  name: z.string(),
  serverId: McpServerAcpIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const McpServerAcpOutboundSchema = z.strictObject({
  name: z.string(),
  serverId: McpServerAcpIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type McpServerAcp = z.output<typeof McpServerAcpSchema>;
const McpServerStdioSchema = z.looseObject({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.array(EnvVariableSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const McpServerStdioOutboundSchema = z.strictObject({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  env: z.array(EnvVariableOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type McpServerStdio = z.output<typeof McpServerStdioSchema>;
const McpServerSchema = z.union([
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
const McpServerOutboundSchema = z.union([
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
type McpServer = z.output<typeof McpServerSchema>;
export {
  ElicitationFormCapabilitiesSchema,
  ElicitationFormCapabilitiesOutboundSchema,
  type ElicitationFormCapabilities,
  ElicitationUrlCapabilitiesSchema,
  ElicitationUrlCapabilitiesOutboundSchema,
  type ElicitationUrlCapabilities,
  ElicitationCapabilitiesSchema,
  ElicitationCapabilitiesOutboundSchema,
  type ElicitationCapabilities,
  NesJumpCapabilitiesSchema,
  NesJumpCapabilitiesOutboundSchema,
  type NesJumpCapabilities,
  NesRenameCapabilitiesSchema,
  NesRenameCapabilitiesOutboundSchema,
  type NesRenameCapabilities,
  NesSearchAndReplaceCapabilitiesSchema,
  NesSearchAndReplaceCapabilitiesOutboundSchema,
  type NesSearchAndReplaceCapabilities,
  ClientNesCapabilitiesSchema,
  ClientNesCapabilitiesOutboundSchema,
  type ClientNesCapabilities,
  ClientCapabilitiesSchema,
  ClientCapabilitiesOutboundSchema,
  type ClientCapabilities,
  InitializeRequestSchema,
  InitializeRequestOutboundSchema,
  type InitializeRequest,
  AuthenticateRequestSchema,
  AuthenticateRequestOutboundSchema,
  type AuthenticateRequest,
  ListProvidersRequestSchema,
  ListProvidersRequestOutboundSchema,
  type ListProvidersRequest,
  SetProviderRequestSchema,
  SetProviderRequestOutboundSchema,
  type SetProviderRequest,
  DisableProviderRequestSchema,
  DisableProviderRequestOutboundSchema,
  type DisableProviderRequest,
  LogoutRequestSchema,
  LogoutRequestOutboundSchema,
  type LogoutRequest,
  HttpHeaderSchema,
  HttpHeaderOutboundSchema,
  type HttpHeader,
  McpServerHttpSchema,
  McpServerHttpOutboundSchema,
  type McpServerHttp,
  McpServerSseSchema,
  McpServerSseOutboundSchema,
  type McpServerSse,
  McpServerAcpSchema,
  McpServerAcpOutboundSchema,
  type McpServerAcp,
  McpServerStdioSchema,
  McpServerStdioOutboundSchema,
  type McpServerStdio,
  McpServerSchema,
  McpServerOutboundSchema,
  type McpServer,
};
