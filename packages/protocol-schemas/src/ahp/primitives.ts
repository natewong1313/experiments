import * as z from "zod";
import {
  ErrorInfoSchema,
  IconSchema,
  ProtectedResourceMetadataSchema,
  TextRangeSchema,
  metaSchema,
  uriSchema,
} from "./common";

const sessionStatusSchema = z.number();

const ModelSelectionSchema = z.strictObject({
  id: z.string(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const AgentSelectionSchema = z.strictObject({
  uri: uriSchema,
});

const ProjectInfoSchema = z.strictObject({
  uri: uriSchema,
  displayName: z.string(),
});

const ToolAnnotationsSchema = z.strictObject({
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

const ToolDefinitionSchema = z.strictObject({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: jsonSchemaObjectSchema.optional(),
  outputSchema: jsonSchemaObjectSchema.optional(),
  annotations: ToolAnnotationsSchema.optional(),
  _meta: metaSchema.optional(),
});

const McpOAuthClientSchema = z.strictObject({
  clientId: z.string(),
  clientSecret: z.string().optional(),
});

const McpAuthRequirementSchema = z.strictObject({
  reason: z.enum(["required", "expired", "insufficientScope"]),
  oauthClient: McpOAuthClientSchema.optional(),
  resource: ProtectedResourceMetadataSchema,
  requiredScopes: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const McpServerStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("starting") }),
  z.strictObject({ kind: z.literal("ready") }),
  z.strictObject({
    kind: z.literal("authRequired"),
    ...McpAuthRequirementSchema.shape,
  }),
  z.strictObject({ kind: z.literal("error"), error: ErrorInfoSchema }),
  z.strictObject({ kind: z.literal("stopped") }),
]);

const CustomizationEnablementSchema = z.discriminatedUnion("kind", [
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

const AgentCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("agent"),
  description: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  disableModelInvocation: z.boolean().optional(),
  disableUserInvocation: z.boolean().optional(),
});

const SkillCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("skill"),
  description: z.string().optional(),
  disableModelInvocation: z.boolean().optional(),
  disableUserInvocation: z.boolean().optional(),
});

const PromptCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("prompt"),
  description: z.string().optional(),
});

const RuleCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("rule"),
  description: z.string().optional(),
  alwaysApply: z.boolean().optional(),
  globs: z.array(z.string()).optional(),
});

const HookCustomizationSchema = z.strictObject({
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

const ChildMcpServerCustomizationSchema = z.strictObject({
  ...childCustomizationBaseFields,
  type: z.literal("mcpServer"),
  state: McpServerStateSchema,
  channel: uriSchema.optional(),
  mcpApp: McpAppCapabilitySchema.optional(),
});

const ChildCustomizationSchema = z.union([
  AgentCustomizationSchema,
  SkillCustomizationSchema,
  PromptCustomizationSchema,
  RuleCustomizationSchema,
  HookCustomizationSchema,
  ChildMcpServerCustomizationSchema,
]);

const CustomizationLoadStateSchema = z.discriminatedUnion("kind", [
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

const TopLevelMcpServerCustomizationSchema = z.strictObject({
  ...customizationBaseFields,
  type: z.literal("mcpServer"),
  ...McpServerCustomizationFields,
});

const PluginCustomizationSchema = z.strictObject({
  ...customizationBaseFields,
  type: z.literal("plugin"),
  clientId: z.string().optional(),
  load: CustomizationLoadStateSchema.optional(),
  enablement: z.array(CustomizationEnablementSchema).optional(),
  version: z.string().optional(),
  children: z.array(ChildCustomizationSchema).optional(),
});

const ClientPluginCustomizationSchema = PluginCustomizationSchema.extend({
  nonce: z.string().optional(),
  childEnablement: z.record(z.string(), z.array(CustomizationEnablementSchema)).optional(),
});

const DirectoryCustomizationSchema = z.strictObject({
  ...customizationBaseFields,
  type: z.literal("directory"),
  clientId: z.string().optional(),
  load: CustomizationLoadStateSchema.optional(),
  enabled: z.boolean(),
  contents: z.enum(["agent", "skill", "prompt", "rule", "hook", "mcpServer"]),
  writable: z.boolean(),
  children: z.array(ChildCustomizationSchema).optional(),
});

const CustomizationSchema = z.union([
  PluginCustomizationSchema,
  DirectoryCustomizationSchema,
  TopLevelMcpServerCustomizationSchema,
]);

type SessionStatus = z.output<typeof sessionStatusSchema>;

type ModelSelection = z.output<typeof ModelSelectionSchema>;

type AgentSelection = z.output<typeof AgentSelectionSchema>;

type ProjectInfo = z.output<typeof ProjectInfoSchema>;

type ToolDefinition = z.output<typeof ToolDefinitionSchema>;

type ToolAnnotations = z.output<typeof ToolAnnotationsSchema>;

type McpAuthRequirement = z.output<typeof McpAuthRequirementSchema>;

type McpServerState = z.output<typeof McpServerStateSchema>;

type McpOAuthClient = z.output<typeof McpOAuthClientSchema>;

type CustomizationEnablement = z.output<typeof CustomizationEnablementSchema>;

type Customization = z.output<typeof CustomizationSchema>;

type PluginCustomization = z.output<typeof PluginCustomizationSchema>;

type ClientPluginCustomization = z.output<typeof ClientPluginCustomizationSchema>;

type DirectoryCustomization = z.output<typeof DirectoryCustomizationSchema>;

type AgentCustomization = z.output<typeof AgentCustomizationSchema>;

type SkillCustomization = z.output<typeof SkillCustomizationSchema>;

type PromptCustomization = z.output<typeof PromptCustomizationSchema>;

type RuleCustomization = z.output<typeof RuleCustomizationSchema>;

type HookCustomization = z.output<typeof HookCustomizationSchema>;

type ChildMcpServerCustomization = z.output<typeof ChildMcpServerCustomizationSchema>;

export {
  AgentCustomizationSchema,
  AgentSelectionSchema,
  ChildMcpServerCustomizationSchema,
  ChildCustomizationSchema,
  ClientPluginCustomizationSchema,
  CustomizationEnablementSchema,
  CustomizationLoadStateSchema,
  CustomizationSchema,
  DirectoryCustomizationSchema,
  HookCustomizationSchema,
  McpAuthRequirementSchema,
  McpOAuthClientSchema,
  McpServerStateSchema,
  ModelSelectionSchema,
  PluginCustomizationSchema,
  ProjectInfoSchema,
  PromptCustomizationSchema,
  RuleCustomizationSchema,
  sessionStatusSchema,
  SkillCustomizationSchema,
  ToolAnnotationsSchema,
  ToolDefinitionSchema,
  TopLevelMcpServerCustomizationSchema,
  type AgentCustomization,
  type AgentSelection,
  type ChildMcpServerCustomization,
  type ClientPluginCustomization,
  type Customization,
  type CustomizationEnablement,
  type DirectoryCustomization,
  type HookCustomization,
  type McpAuthRequirement,
  type McpOAuthClient,
  type McpServerState,
  type ModelSelection,
  type PluginCustomization,
  type ProjectInfo,
  type PromptCustomization,
  type RuleCustomization,
  type SessionStatus,
  type SkillCustomization,
  type ToolAnnotations,
  type ToolDefinition,
};
