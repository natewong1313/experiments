import * as z from "zod";
import { ConfigSchemaSchema, ProtectedResourceMetadataSchema, metaSchema } from "../common";
import { CustomizationSchema } from "../primitives";
import { TerminalInfoSchema } from "./terminal";

export const AgentCapabilitiesSchema = z.strictObject({
  multipleChats: z
    .strictObject({
      fork: z.boolean().optional(),
      sideChat: z.boolean().optional(),
    })
    .optional(),
  multipleWorkingDirectories: z
    .strictObject({
      immutablePrimary: z.boolean().optional(),
      primaryReplacement: z.boolean().optional(),
    })
    .optional(),
});

export type AgentCapabilities = z.output<typeof AgentCapabilitiesSchema>;

export const SessionModelInfoSchema = z.strictObject({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  maxContextWindow: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  maxPromptTokens: z.number().optional(),
  supportsVision: z.boolean().optional(),
  policyState: z.enum(["enabled", "disabled", "unconfigured"]).optional(),
  configSchema: ConfigSchemaSchema.optional(),
  _meta: metaSchema.optional(),
});

export const AgentInfoSchema = z.strictObject({
  provider: z.string(),
  displayName: z.string(),
  description: z.string(),
  models: z.array(SessionModelInfoSchema),
  protectedResources: z.array(ProtectedResourceMetadataSchema).optional(),
  customizations: z.array(CustomizationSchema).optional(),
  capabilities: AgentCapabilitiesSchema.optional(),
});

export const RootConfigStateSchema = z.strictObject({
  schema: ConfigSchemaSchema,
  values: z.record(z.string(), z.unknown()),
});

export const RootStateSchema = z.strictObject({
  agents: z.array(AgentInfoSchema),
  activeSessions: z.number().optional(),
  terminals: z.array(TerminalInfoSchema).optional(),
  config: RootConfigStateSchema.optional(),
  _meta: metaSchema.optional(),
});

export const RootActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("root/agentsChanged"),
    agents: z.array(AgentInfoSchema),
  }),
  z.strictObject({
    type: z.literal("root/activeSessionsChanged"),
    activeSessions: z.number(),
  }),
  z.strictObject({
    type: z.literal("root/terminalsChanged"),
    terminals: z.array(TerminalInfoSchema),
  }),
  z.strictObject({
    type: z.literal("root/configChanged"),
    config: z.record(z.string(), z.unknown()),
    replace: z.boolean().optional(),
  }),
]);

export type SessionModelInfo = z.output<typeof SessionModelInfoSchema>;

export type AgentInfo = z.output<typeof AgentInfoSchema>;

export type RootConfigState = z.output<typeof RootConfigStateSchema>;

export type RootState = z.output<typeof RootStateSchema>;

export type RootAction = z.output<typeof RootActionSchema>;
