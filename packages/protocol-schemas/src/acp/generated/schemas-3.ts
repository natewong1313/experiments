// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";

const PromptCapabilitiesSchema = z.looseObject({
  image: z.boolean().optional(),
  audio: z.boolean().optional(),
  embeddedContext: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PromptCapabilitiesOutboundSchema = z.strictObject({
  image: z.boolean().optional(),
  audio: z.boolean().optional(),
  embeddedContext: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PromptCapabilities = z.output<typeof PromptCapabilitiesSchema>;
const McpCapabilitiesSchema = z.looseObject({
  http: z.boolean().optional(),
  sse: z.boolean().optional(),
  acp: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const McpCapabilitiesOutboundSchema = z.strictObject({
  http: z.boolean().optional(),
  sse: z.boolean().optional(),
  acp: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type McpCapabilities = z.output<typeof McpCapabilitiesSchema>;
const SessionListCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionListCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionListCapabilities = z.output<typeof SessionListCapabilitiesSchema>;
const SessionDeleteCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionDeleteCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionDeleteCapabilities = z.output<typeof SessionDeleteCapabilitiesSchema>;
const SessionAdditionalDirectoriesCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionAdditionalDirectoriesCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionAdditionalDirectoriesCapabilities = z.output<
  typeof SessionAdditionalDirectoriesCapabilitiesSchema
>;
const SessionForkCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionForkCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionForkCapabilities = z.output<typeof SessionForkCapabilitiesSchema>;
const SessionResumeCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionResumeCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionResumeCapabilities = z.output<typeof SessionResumeCapabilitiesSchema>;
const SessionCloseCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionCloseCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionCloseCapabilities = z.output<typeof SessionCloseCapabilitiesSchema>;
const SessionCapabilitiesSchema = z.looseObject({
  list: z.union([SessionListCapabilitiesSchema, z.null()]).optional(),
  delete: z.union([SessionDeleteCapabilitiesSchema, z.null()]).optional(),
  additionalDirectories: z
    .union([SessionAdditionalDirectoriesCapabilitiesSchema, z.null()])
    .optional(),
  fork: z.union([SessionForkCapabilitiesSchema, z.null()]).optional(),
  resume: z.union([SessionResumeCapabilitiesSchema, z.null()]).optional(),
  close: z.union([SessionCloseCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionCapabilitiesOutboundSchema = z.strictObject({
  list: z.union([SessionListCapabilitiesOutboundSchema, z.null()]).optional(),
  delete: z.union([SessionDeleteCapabilitiesOutboundSchema, z.null()]).optional(),
  additionalDirectories: z
    .union([SessionAdditionalDirectoriesCapabilitiesOutboundSchema, z.null()])
    .optional(),
  fork: z.union([SessionForkCapabilitiesOutboundSchema, z.null()]).optional(),
  resume: z.union([SessionResumeCapabilitiesOutboundSchema, z.null()]).optional(),
  close: z.union([SessionCloseCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionCapabilities = z.output<typeof SessionCapabilitiesSchema>;
const LogoutCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const LogoutCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type LogoutCapabilities = z.output<typeof LogoutCapabilitiesSchema>;
const AgentAuthCapabilitiesSchema = z.looseObject({
  logout: z.union([LogoutCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AgentAuthCapabilitiesOutboundSchema = z.strictObject({
  logout: z.union([LogoutCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type AgentAuthCapabilities = z.output<typeof AgentAuthCapabilitiesSchema>;
const ProvidersCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ProvidersCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ProvidersCapabilities = z.output<typeof ProvidersCapabilitiesSchema>;
const NesDocumentDidOpenCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesDocumentDidOpenCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesDocumentDidOpenCapabilities = z.output<typeof NesDocumentDidOpenCapabilitiesSchema>;
const TextDocumentSyncKindSchema = z.union([z.literal("full"), z.literal("incremental")]);
const TextDocumentSyncKindOutboundSchema = z.union([z.literal("full"), z.literal("incremental")]);
type TextDocumentSyncKind = z.output<typeof TextDocumentSyncKindSchema>;
const NesDocumentDidChangeCapabilitiesSchema = z.looseObject({
  syncKind: TextDocumentSyncKindSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesDocumentDidChangeCapabilitiesOutboundSchema = z.strictObject({
  syncKind: TextDocumentSyncKindOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesDocumentDidChangeCapabilities = z.output<typeof NesDocumentDidChangeCapabilitiesSchema>;
const NesDocumentDidCloseCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesDocumentDidCloseCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesDocumentDidCloseCapabilities = z.output<typeof NesDocumentDidCloseCapabilitiesSchema>;
const NesDocumentDidSaveCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesDocumentDidSaveCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesDocumentDidSaveCapabilities = z.output<typeof NesDocumentDidSaveCapabilitiesSchema>;
const NesDocumentDidFocusCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesDocumentDidFocusCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesDocumentDidFocusCapabilities = z.output<typeof NesDocumentDidFocusCapabilitiesSchema>;
const NesDocumentEventCapabilitiesSchema = z.looseObject({
  didOpen: z.union([NesDocumentDidOpenCapabilitiesSchema, z.null()]).optional(),
  didChange: z.union([NesDocumentDidChangeCapabilitiesSchema, z.null()]).optional(),
  didClose: z.union([NesDocumentDidCloseCapabilitiesSchema, z.null()]).optional(),
  didSave: z.union([NesDocumentDidSaveCapabilitiesSchema, z.null()]).optional(),
  didFocus: z.union([NesDocumentDidFocusCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesDocumentEventCapabilitiesOutboundSchema = z.strictObject({
  didOpen: z.union([NesDocumentDidOpenCapabilitiesOutboundSchema, z.null()]).optional(),
  didChange: z.union([NesDocumentDidChangeCapabilitiesOutboundSchema, z.null()]).optional(),
  didClose: z.union([NesDocumentDidCloseCapabilitiesOutboundSchema, z.null()]).optional(),
  didSave: z.union([NesDocumentDidSaveCapabilitiesOutboundSchema, z.null()]).optional(),
  didFocus: z.union([NesDocumentDidFocusCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesDocumentEventCapabilities = z.output<typeof NesDocumentEventCapabilitiesSchema>;
const NesEventCapabilitiesSchema = z.looseObject({
  document: z.union([NesDocumentEventCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NesEventCapabilitiesOutboundSchema = z.strictObject({
  document: z.union([NesDocumentEventCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NesEventCapabilities = z.output<typeof NesEventCapabilitiesSchema>;
export {
  PromptCapabilitiesSchema,
  PromptCapabilitiesOutboundSchema,
  type PromptCapabilities,
  McpCapabilitiesSchema,
  McpCapabilitiesOutboundSchema,
  type McpCapabilities,
  SessionListCapabilitiesSchema,
  SessionListCapabilitiesOutboundSchema,
  type SessionListCapabilities,
  SessionDeleteCapabilitiesSchema,
  SessionDeleteCapabilitiesOutboundSchema,
  type SessionDeleteCapabilities,
  SessionAdditionalDirectoriesCapabilitiesSchema,
  SessionAdditionalDirectoriesCapabilitiesOutboundSchema,
  type SessionAdditionalDirectoriesCapabilities,
  SessionForkCapabilitiesSchema,
  SessionForkCapabilitiesOutboundSchema,
  type SessionForkCapabilities,
  SessionResumeCapabilitiesSchema,
  SessionResumeCapabilitiesOutboundSchema,
  type SessionResumeCapabilities,
  SessionCloseCapabilitiesSchema,
  SessionCloseCapabilitiesOutboundSchema,
  type SessionCloseCapabilities,
  SessionCapabilitiesSchema,
  SessionCapabilitiesOutboundSchema,
  type SessionCapabilities,
  LogoutCapabilitiesSchema,
  LogoutCapabilitiesOutboundSchema,
  type LogoutCapabilities,
  AgentAuthCapabilitiesSchema,
  AgentAuthCapabilitiesOutboundSchema,
  type AgentAuthCapabilities,
  ProvidersCapabilitiesSchema,
  ProvidersCapabilitiesOutboundSchema,
  type ProvidersCapabilities,
  NesDocumentDidOpenCapabilitiesSchema,
  NesDocumentDidOpenCapabilitiesOutboundSchema,
  type NesDocumentDidOpenCapabilities,
  TextDocumentSyncKindSchema,
  TextDocumentSyncKindOutboundSchema,
  type TextDocumentSyncKind,
  NesDocumentDidChangeCapabilitiesSchema,
  NesDocumentDidChangeCapabilitiesOutboundSchema,
  type NesDocumentDidChangeCapabilities,
  NesDocumentDidCloseCapabilitiesSchema,
  NesDocumentDidCloseCapabilitiesOutboundSchema,
  type NesDocumentDidCloseCapabilities,
  NesDocumentDidSaveCapabilitiesSchema,
  NesDocumentDidSaveCapabilitiesOutboundSchema,
  type NesDocumentDidSaveCapabilities,
  NesDocumentDidFocusCapabilitiesSchema,
  NesDocumentDidFocusCapabilitiesOutboundSchema,
  type NesDocumentDidFocusCapabilities,
  NesDocumentEventCapabilitiesSchema,
  NesDocumentEventCapabilitiesOutboundSchema,
  type NesDocumentEventCapabilities,
  NesEventCapabilitiesSchema,
  NesEventCapabilitiesOutboundSchema,
  type NesEventCapabilities,
};
