import * as z from "zod";
import {
  ErrorInfoSchema,
  UsageInfoSchema,
  isoTimestampSchema,
  uriSchema,
} from "../common";

const AutomationRunLifecycleSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("pending"),
    createdAt: isoTimestampSchema,
  }),
  z.strictObject({
    status: z.literal("running"),
    createdAt: isoTimestampSchema,
    startedAt: isoTimestampSchema,
  }),
  z.strictObject({
    status: z.literal("completed"),
    createdAt: isoTimestampSchema,
    startedAt: isoTimestampSchema,
    completedAt: isoTimestampSchema,
    usage: UsageInfoSchema.optional(),
  }),
  z.strictObject({
    status: z.literal("failed"),
    createdAt: isoTimestampSchema,
    startedAt: isoTimestampSchema.optional(),
    completedAt: isoTimestampSchema,
    error: ErrorInfoSchema,
  }),
  z.strictObject({
    status: z.literal("cancelled"),
    createdAt: isoTimestampSchema,
    startedAt: isoTimestampSchema.optional(),
    completedAt: isoTimestampSchema,
  }),
]);

const AutomationRunOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("manual") }),
  z.strictObject({
    kind: z.literal("trigger"),
    triggerId: z.string(),
    scheduledFor: isoTimestampSchema.optional(),
    catchUp: z.boolean().optional(),
    event: z.record(z.string(), z.unknown()).optional(),
  }),
]);

const AutomationRunStateSchema = z.strictObject({
  resource: uriSchema,
  automation: uriSchema,
  origin: AutomationRunOriginSchema,
  lifecycle: AutomationRunLifecycleSchema,
  sessions: z.array(uriSchema),
  primarySession: uriSchema.optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

const AutomationRunSummarySchema = z.strictObject({
  resource: uriSchema,
  automation: uriSchema,
  origin: AutomationRunOriginSchema,
  lifecycle: AutomationRunLifecycleSchema,
  primarySession: uriSchema.optional(),
  sessionCount: z.number(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

const AutomationRunActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("automationRun/lifecycleChanged"),
    lifecycle: AutomationRunLifecycleSchema,
  }),
  z.strictObject({
    type: z.literal("automationRun/sessionSet"),
    session: uriSchema,
  }),
  z.strictObject({
    type: z.literal("automationRun/sessionRemoved"),
    session: uriSchema,
  }),
  z.strictObject({
    type: z.literal("automationRun/primarySessionChanged"),
    primarySession: uriSchema.optional(),
  }),
  z.strictObject({ type: z.literal("automationRun/cancelRequested") }),
]);

type AutomationRunLifecycle = z.output<typeof AutomationRunLifecycleSchema>;
type AutomationRunOrigin = z.output<typeof AutomationRunOriginSchema>;
type AutomationRunState = z.output<typeof AutomationRunStateSchema>;
type AutomationRunSummary = z.output<typeof AutomationRunSummarySchema>;
type AutomationRunAction = z.output<typeof AutomationRunActionSchema>;

export {
  AutomationRunActionSchema,
  AutomationRunLifecycleSchema,
  AutomationRunOriginSchema,
  AutomationRunStateSchema,
  AutomationRunSummarySchema,
  type AutomationRunAction,
  type AutomationRunLifecycle,
  type AutomationRunOrigin,
  type AutomationRunState,
  type AutomationRunSummary,
};
