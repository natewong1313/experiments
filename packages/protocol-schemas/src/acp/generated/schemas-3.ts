// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";

export const PromptCapabilitiesSchema = z.looseObject({
  image: z.boolean().optional(),
  audio: z.boolean().optional(),
  embeddedContext: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PromptCapabilitiesOutboundSchema = z.strictObject({
  image: z.boolean().optional(),
  audio: z.boolean().optional(),
  embeddedContext: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PromptCapabilities = z.output<typeof PromptCapabilitiesSchema>;

export const McpCapabilitiesSchema = z.looseObject({
  http: z.boolean().optional(),
  sse: z.boolean().optional(),
  acp: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const McpCapabilitiesOutboundSchema = z.strictObject({
  http: z.boolean().optional(),
  sse: z.boolean().optional(),
  acp: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type McpCapabilities = z.output<typeof McpCapabilitiesSchema>;

export const SessionListCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionListCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionListCapabilities = z.output<typeof SessionListCapabilitiesSchema>;

export const SessionDeleteCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionDeleteCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionDeleteCapabilities = z.output<typeof SessionDeleteCapabilitiesSchema>;

export const SessionAdditionalDirectoriesCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionAdditionalDirectoriesCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionAdditionalDirectoriesCapabilities = z.output<
  typeof SessionAdditionalDirectoriesCapabilitiesSchema
>;

export const SessionForkCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionForkCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionForkCapabilities = z.output<typeof SessionForkCapabilitiesSchema>;

export const SessionResumeCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionResumeCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionResumeCapabilities = z.output<typeof SessionResumeCapabilitiesSchema>;

export const SessionCloseCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionCloseCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionCloseCapabilities = z.output<typeof SessionCloseCapabilitiesSchema>;

export const SessionCapabilitiesSchema = z.looseObject({
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

export const SessionCapabilitiesOutboundSchema = z.strictObject({
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

export type SessionCapabilities = z.output<typeof SessionCapabilitiesSchema>;

export const LogoutCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const LogoutCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type LogoutCapabilities = z.output<typeof LogoutCapabilitiesSchema>;

export const AgentAuthCapabilitiesSchema = z.looseObject({
  logout: z.union([LogoutCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AgentAuthCapabilitiesOutboundSchema = z.strictObject({
  logout: z.union([LogoutCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AgentAuthCapabilities = z.output<typeof AgentAuthCapabilitiesSchema>;

export const ProvidersCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ProvidersCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ProvidersCapabilities = z.output<typeof ProvidersCapabilitiesSchema>;

export const NesDocumentDidOpenCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesDocumentDidOpenCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesDocumentDidOpenCapabilities = z.output<typeof NesDocumentDidOpenCapabilitiesSchema>;

export const TextDocumentSyncKindSchema = z.enum(["full", "incremental"]);

export const TextDocumentSyncKindOutboundSchema = z.enum(["full", "incremental"]);

export type TextDocumentSyncKind = z.output<typeof TextDocumentSyncKindSchema>;

export const NesDocumentDidChangeCapabilitiesSchema = z.looseObject({
  syncKind: TextDocumentSyncKindSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesDocumentDidChangeCapabilitiesOutboundSchema = z.strictObject({
  syncKind: TextDocumentSyncKindOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesDocumentDidChangeCapabilities = z.output<
  typeof NesDocumentDidChangeCapabilitiesSchema
>;

export const NesDocumentDidCloseCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesDocumentDidCloseCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesDocumentDidCloseCapabilities = z.output<
  typeof NesDocumentDidCloseCapabilitiesSchema
>;

export const NesDocumentDidSaveCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesDocumentDidSaveCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesDocumentDidSaveCapabilities = z.output<typeof NesDocumentDidSaveCapabilitiesSchema>;

export const NesDocumentDidFocusCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesDocumentDidFocusCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesDocumentDidFocusCapabilities = z.output<
  typeof NesDocumentDidFocusCapabilitiesSchema
>;

export const NesDocumentEventCapabilitiesSchema = z.looseObject({
  didOpen: z.union([NesDocumentDidOpenCapabilitiesSchema, z.null()]).optional(),
  didChange: z.union([NesDocumentDidChangeCapabilitiesSchema, z.null()]).optional(),
  didClose: z.union([NesDocumentDidCloseCapabilitiesSchema, z.null()]).optional(),
  didSave: z.union([NesDocumentDidSaveCapabilitiesSchema, z.null()]).optional(),
  didFocus: z.union([NesDocumentDidFocusCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesDocumentEventCapabilitiesOutboundSchema = z.strictObject({
  didOpen: z.union([NesDocumentDidOpenCapabilitiesOutboundSchema, z.null()]).optional(),
  didChange: z.union([NesDocumentDidChangeCapabilitiesOutboundSchema, z.null()]).optional(),
  didClose: z.union([NesDocumentDidCloseCapabilitiesOutboundSchema, z.null()]).optional(),
  didSave: z.union([NesDocumentDidSaveCapabilitiesOutboundSchema, z.null()]).optional(),
  didFocus: z.union([NesDocumentDidFocusCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesDocumentEventCapabilities = z.output<typeof NesDocumentEventCapabilitiesSchema>;

export const NesEventCapabilitiesSchema = z.looseObject({
  document: z.union([NesDocumentEventCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesEventCapabilitiesOutboundSchema = z.strictObject({
  document: z.union([NesDocumentEventCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesEventCapabilities = z.output<typeof NesEventCapabilitiesSchema>;
