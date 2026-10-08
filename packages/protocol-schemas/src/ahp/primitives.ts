import * as z from "zod";
import {
  ErrorInfoSchema,
  IconSchema,
  ProtectedResourceMetadataSchema,
  TextRangeSchema,
  metaSchema,
  uriSchema,
} from "./common";

export const sessionStatusSchema = z.number();

export const ModelSelectionSchema = z.strictObject({
  id: z.string(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const AgentSelectionSchema = z.strictObject({
  uri: uriSchema,
});

export const ProjectInfoSchema = z.strictObject({
  uri: uriSchema,
  displayName: z.string(),
});

export const ToolAnnotationsSchema = z.strictObject({
  title: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});

const jsonSchemaObjectSchema = z.strictObject({
  type: z.literal("object"),
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
});

export const ToolDefinitionSchema = z.strictObject({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: jsonSchemaObjectSchema.optional(),
  outputSchema: jsonSchemaObjectSchema.optional(),
  annotations: ToolAnnotationsSchema.optional(),
  _meta: metaSchema.optional(),
});

export const McpOAuthClientSchema = z.strictObject({
  clientId: z.string(),
  clientSecret: z.string().optional(),
});

export const McpAuthRequirementSchema = z.strictObject({
  reason: z.enum(["required", "expired", "insufficientScope"]),
  oauthClient: McpOAuthClientSchema.optional(),
  resource: ProtectedResourceMetadataSchema,
  requiredScopes: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const McpServerStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("starting") }),
  z.strictObject({ kind: z.literal("ready") }),
  z.strictObject({
    kind: z.literal("authRequired"),
    ...McpAuthRequirementSchema.shape,
  }),
  z.strictObject({ kind: z.literal("error"), error: ErrorInfoSchema }),
  z.strictObject({ kind: z.literal("stopped") }),
]);

export const CustomizationEnablementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("global"), enabled: z.boolean() }),
  z.strictObject({
    kind: z.literal("workspace"),
    uri: uriSchema,
    enabled: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("session"), enabled: z.boolean() }),
]);

const customizationBaseFields = {
  id: z.string(),
  uri: uriSchema,
  name: z.string(),
  icons: z.array(IconSchema).optional(),
  range: TextRangeSchema.optional(),
  _meta: metaSchema.optional(),
};

const childCustomizationBaseFields = {
  ...customizationBaseFields,
  enabled: z.boolean().optional(),
};

export const AgentCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("agent"),
  description: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  disableModelInvocation: z.boolean().optional(),
  disableUserInvocation: z.boolean().optional(),
});

export const SkillCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("skill"),
  description: z.string().optional(),
  disableModelInvocation: z.boolean().optional(),
  disableUserInvocation: z.boolean().optional(),
});

export const PromptCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("prompt"),
  description: z.string().optional(),
});

export const RuleCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("rule"),
  description: z.string().optional(),
  alwaysApply: z.boolean().optional(),
  globs: z.array(z.string()).optional(),
});

export const HookCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("hook"),
});

const emptyRecordSchema = z.strictObject({});

const AhpMcpUiHostCapabilitiesSchema = z.strictObject({
  serverTools: z.strictObject({ listChanged: z.boolean().optional() }).optional(),
  serverResources: z.strictObject({ listChanged: z.boolean().optional() }).optional(),
  logging: emptyRecordSchema.optional(),
  sampling: z.strictObject({ tools: emptyRecordSchema.optional() }).optional(),
});

const McpAppCapabilitySchema = z.strictObject({
  capabilities: AhpMcpUiHostCapabilitiesSchema,
});

export const ChildMcpServerCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("mcpServer"),
  state: McpServerStateSchema,
  channel: uriSchema.optional(),
  mcpApp: McpAppCapabilitySchema.optional(),
});

export const ChildCustomizationSchema = z.union([
  AgentCustomizationSchema,
  SkillCustomizationSchema,
  PromptCustomizationSchema,
  RuleCustomizationSchema,
  HookCustomizationSchema,
  ChildMcpServerCustomizationSchema,
]);

export const CustomizationLoadStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("loading") }),
  z.strictObject({ kind: z.literal("loaded") }),
  z.strictObject({ kind: z.literal("degraded"), message: z.string() }),
  z.strictObject({ kind: z.literal("error"), message: z.string() }),
]);

const McpServerCustomizationFields = {
  enablement: z.array(CustomizationEnablementSchema).optional(),
  state: McpServerStateSchema,
  channel: uriSchema.optional(),
  mcpApp: McpAppCapabilitySchema.optional(),
};

export const TopLevelMcpServerCustomizationSchema = z.strictObject({
  ...customizationBaseFields,
  type: z.literal("mcpServer"),
  ...McpServerCustomizationFields,
});

export const PluginCustomizationSchema = z.strictObject({
  ...customizationBaseFields,
  type: z.literal("plugin"),
  clientId: z.string().optional(),
  load: CustomizationLoadStateSchema.optional(),
  enablement: z.array(CustomizationEnablementSchema).optional(),
  version: z.string().optional(),
  children: z.array(ChildCustomizationSchema).optional(),
});

export const ClientPluginCustomizationSchema = PluginCustomizationSchema.extend({
  nonce: z.string().optional(),
  childEnablement: z.record(z.string(), z.array(CustomizationEnablementSchema)).optional(),
});

export const DirectoryCustomizationSchema = z.strictObject({
  ...customizationBaseFields,
  type: z.literal("directory"),
  clientId: z.string().optional(),
  load: CustomizationLoadStateSchema.optional(),
  enabled: z.boolean(),
  contents: z.enum(["agent", "skill", "prompt", "rule", "hook", "mcpServer"]),
  writable: z.boolean(),
  children: z.array(ChildCustomizationSchema).optional(),
});

export const CustomizationSchema = z.union([
  PluginCustomizationSchema,
  DirectoryCustomizationSchema,
  TopLevelMcpServerCustomizationSchema,
]);

export type SessionStatus = z.output<typeof sessionStatusSchema>;

export type ModelSelection = z.output<typeof ModelSelectionSchema>;

export type AgentSelection = z.output<typeof AgentSelectionSchema>;

export type ProjectInfo = z.output<typeof ProjectInfoSchema>;

export type ToolDefinition = z.output<typeof ToolDefinitionSchema>;

export type ToolAnnotations = z.output<typeof ToolAnnotationsSchema>;

export type McpAuthRequirement = z.output<typeof McpAuthRequirementSchema>;

export type McpServerState = z.output<typeof McpServerStateSchema>;

export type McpOAuthClient = z.output<typeof McpOAuthClientSchema>;

export type CustomizationEnablement = z.output<typeof CustomizationEnablementSchema>;

export type Customization = z.output<typeof CustomizationSchema>;

export type PluginCustomization = z.output<typeof PluginCustomizationSchema>;

export type ClientPluginCustomization = z.output<typeof ClientPluginCustomizationSchema>;

export type DirectoryCustomization = z.output<typeof DirectoryCustomizationSchema>;

export type AgentCustomization = z.output<typeof AgentCustomizationSchema>;

export type SkillCustomization = z.output<typeof SkillCustomizationSchema>;

export type PromptCustomization = z.output<typeof PromptCustomizationSchema>;

export type RuleCustomization = z.output<typeof RuleCustomizationSchema>;

export type HookCustomization = z.output<typeof HookCustomizationSchema>;

export type ChildMcpServerCustomization = z.output<typeof ChildMcpServerCustomizationSchema>;
