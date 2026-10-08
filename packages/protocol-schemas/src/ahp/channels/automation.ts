import * as z from "zod";
import { ConfigSchemaSchema, isoTimestampSchema, metaSchema, uriSchema } from "../common";
import { AgentSelectionSchema, ModelSelectionSchema } from "../primitives";
import { MessageSchema } from "./chat/message";
import { AutomationRunSummarySchema } from "./automation-run";

export const AutomationScheduleSchema = z.strictObject({
  expression: z.string(),
  timeZone: z.string(),
});

export const AutomationTriggerSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: z.string(),
    kind: z.literal("schedule"),
    schedule: AutomationScheduleSchema,
    misfirePolicy: z.enum(["skip", "runOnce"]).optional(),
  }),
  z.strictObject({
    id: z.string(),
    kind: z.literal("event"),
    type: z.string(),
    title: z.string(),
    description: z.string().optional(),
    events: z.array(
      z.strictObject({
        id: z.string(),
        title: z.string(),
        description: z.string().optional(),
      }),
    ),
    config: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export const AutomationTriggerDefinitionSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  events: z.array(
    z.strictObject({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
    }),
  ),
  configSchema: ConfigSchemaSchema.optional(),
});

export const AutomationSessionTemplateSchema = z.strictObject({
  provider: z.string().optional(),
  model: ModelSelectionSchema.optional(),
  agent: AgentSelectionSchema.optional(),
  workingDirectories: z.array(uriSchema).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const AutomationDefinitionSchema = z.strictObject({
  title: z.string(),
  message: MessageSchema,
  session: AutomationSessionTemplateSchema,
  enabled: z.boolean(),
  triggers: z.array(AutomationTriggerSchema),
  _meta: metaSchema.optional(),
});

export const AutomationDefinitionPatchSchema = z.strictObject({
  title: z.string().optional(),
  message: MessageSchema.optional(),
  session: AutomationSessionTemplateSchema.optional(),
  enabled: z.boolean().optional(),
  triggers: z.array(AutomationTriggerSchema).optional(),
  _meta: metaSchema.optional(),
});

export const AutomationOperationSchema = z.enum(["update", "remove", "run"]);

export const AutomationEntrySchema = z.strictObject({
  resource: uriSchema,
  definition: AutomationDefinitionSchema,
  nextRunAt: isoTimestampSchema.optional(),
  runs: z.array(AutomationRunSummarySchema),
  runsNextCursor: z.string().optional(),
  operations: z.array(AutomationOperationSchema),
  createdAt: isoTimestampSchema,
  modifiedAt: isoTimestampSchema,
  _meta: metaSchema.optional(),
});

export const AutomationStateSchema = z.strictObject({
  entries: z.array(AutomationEntrySchema),
  _meta: metaSchema.optional(),
});

export const AutomationActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("automation/createRequested"),
    resource: uriSchema,
    definition: AutomationDefinitionSchema,
  }),
  z.strictObject({
    type: z.literal("automation/updateRequested"),
    resource: uriSchema,
    changes: AutomationDefinitionPatchSchema,
  }),
  z.strictObject({
    type: z.literal("automation/set"),
    automation: AutomationEntrySchema,
  }),
  z.strictObject({
    type: z.literal("automation/removed"),
    resource: uriSchema,
  }),
]);

export type AutomationSchedule = z.output<typeof AutomationScheduleSchema>;

export type AutomationTrigger = z.output<typeof AutomationTriggerSchema>;

export type AutomationTriggerDefinition = z.output<typeof AutomationTriggerDefinitionSchema>;

export type AutomationSessionTemplate = z.output<typeof AutomationSessionTemplateSchema>;

export type AutomationDefinition = z.output<typeof AutomationDefinitionSchema>;

export type AutomationDefinitionPatch = z.output<typeof AutomationDefinitionPatchSchema>;

export type AutomationOperation = z.output<typeof AutomationOperationSchema>;

export type AutomationEntry = z.output<typeof AutomationEntrySchema>;

export type AutomationState = z.output<typeof AutomationStateSchema>;

export type AutomationAction = z.output<typeof AutomationActionSchema>;
