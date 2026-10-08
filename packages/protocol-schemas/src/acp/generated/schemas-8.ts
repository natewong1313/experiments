// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { ContentBlockSchema, ContentBlockOutboundSchema } from "./schemas-0";
import {
  SessionModeIdSchema,
  SessionModeIdOutboundSchema,
  SessionConfigOptionSchema,
  SessionConfigOptionOutboundSchema,
} from "./schemas-5";
import {
  StopReasonSchema,
  StopReasonOutboundSchema,
  UsageSchema,
  UsageOutboundSchema,
} from "./schemas-6";
import { PlanIdSchema, PlanIdOutboundSchema } from "./schemas-7";

export const PlanRemovedSchema = z.looseObject({
  planId: PlanIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanRemovedOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PlanRemoved = z.output<typeof PlanRemovedSchema>;

export const UnstructuredCommandInputSchema = z.looseObject({
  hint: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const UnstructuredCommandInputOutboundSchema = z.strictObject({
  hint: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type UnstructuredCommandInput = z.output<typeof UnstructuredCommandInputSchema>;

export const AvailableCommandInputSchema = UnstructuredCommandInputSchema;

export const AvailableCommandInputOutboundSchema = UnstructuredCommandInputOutboundSchema;

export type AvailableCommandInput = z.output<typeof AvailableCommandInputSchema>;

export const AvailableCommandSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  input: z.union([AvailableCommandInputSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AvailableCommandOutboundSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  input: z.union([AvailableCommandInputOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AvailableCommand = z.output<typeof AvailableCommandSchema>;

export const AvailableCommandsUpdateSchema = z.looseObject({
  availableCommands: z.array(AvailableCommandSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AvailableCommandsUpdateOutboundSchema = z.strictObject({
  availableCommands: z.array(AvailableCommandOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AvailableCommandsUpdate = z.output<typeof AvailableCommandsUpdateSchema>;

export const CurrentModeUpdateSchema = z.looseObject({
  currentModeId: SessionModeIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CurrentModeUpdateOutboundSchema = z.strictObject({
  currentModeId: SessionModeIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CurrentModeUpdate = z.output<typeof CurrentModeUpdateSchema>;

export const ConfigOptionUpdateSchema = z.looseObject({
  configOptions: z.array(SessionConfigOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ConfigOptionUpdateOutboundSchema = z.strictObject({
  configOptions: z.array(SessionConfigOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ConfigOptionUpdate = z.output<typeof ConfigOptionUpdateSchema>;

export const SessionInfoUpdateSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionInfoUpdateOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionInfoUpdate = z.output<typeof SessionInfoUpdateSchema>;

export const CostSchema = z.looseObject({
  amount: z.number(),
  currency: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CostOutboundSchema = z.strictObject({
  amount: z.number(),
  currency: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Cost = z.output<typeof CostSchema>;

export const UsageUpdateSchema = z.looseObject({
  used: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  size: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  cost: z.union([CostSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const UsageUpdateOutboundSchema = z.strictObject({
  used: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  size: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  cost: z.union([CostOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type UsageUpdate = z.output<typeof UsageUpdateSchema>;

export const NoticeSeveritySchema = z.union([
  z.literal("info"),
  z.literal("warning"),
  z.literal("error"),
  z.string(),
]);

export const NoticeSeverityOutboundSchema = z.union([
  z.literal("info"),
  z.literal("warning"),
  z.literal("error"),
  z.string(),
]);

export type NoticeSeverity = z.output<typeof NoticeSeveritySchema>;

export const NoticeSchema = z.looseObject({
  severity: NoticeSeveritySchema,
  title: z.string().min(1),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NoticeOutboundSchema = z.strictObject({
  severity: NoticeSeverityOutboundSchema,
  title: z.string().min(1),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Notice = z.output<typeof NoticeSchema>;

export const CompactionIdSchema = z.string();

export const CompactionIdOutboundSchema = z.string();

export type CompactionId = z.output<typeof CompactionIdSchema>;

export const CompactionStatusSchema = z.union([
  z.literal("in_progress"),
  z.literal("completed"),
  z.literal("failed"),
  z.literal("cancelled"),
  z.string(),
]);

export const CompactionStatusOutboundSchema = z.union([
  z.literal("in_progress"),
  z.literal("completed"),
  z.literal("failed"),
  z.literal("cancelled"),
  z.string(),
]);

export type CompactionStatus = z.output<typeof CompactionStatusSchema>;

export const CompactionUpdateSchema = z.looseObject({
  compactionId: CompactionIdSchema,
  status: CompactionStatusSchema,
  summary: z.union([z.array(ContentBlockSchema), z.null()]).optional(),
  error: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CompactionUpdateOutboundSchema = z.strictObject({
  compactionId: CompactionIdOutboundSchema,
  status: CompactionStatusOutboundSchema,
  summary: z.union([z.array(ContentBlockOutboundSchema), z.null()]).optional(),
  error: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CompactionUpdate = z.output<typeof CompactionUpdateSchema>;

export const CompactionSummaryChunkSchema = z.looseObject({
  compactionId: CompactionIdSchema,
  content: ContentBlockSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CompactionSummaryChunkOutboundSchema = z.strictObject({
  compactionId: CompactionIdOutboundSchema,
  content: ContentBlockOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CompactionSummaryChunk = z.output<typeof CompactionSummaryChunkSchema>;

export const SessionCancelCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionCancelCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionCancelCapabilities = z.output<typeof SessionCancelCapabilitiesSchema>;

export const SubagentSessionCapabilitiesSchema = z.looseObject({
  cancel: z.union([SessionCancelCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SubagentSessionCapabilitiesOutboundSchema = z.strictObject({
  cancel: z.union([SessionCancelCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SubagentSessionCapabilities = z.output<typeof SubagentSessionCapabilitiesSchema>;

export const RunningStateUpdateSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const RunningStateUpdateOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type RunningStateUpdate = z.output<typeof RunningStateUpdateSchema>;

export const IdleStateUpdateSchema = z.looseObject({
  stopReason: z.union([StopReasonSchema, z.null()]).optional(),
  usage: z.union([UsageSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const IdleStateUpdateOutboundSchema = z.strictObject({
  stopReason: z.union([StopReasonOutboundSchema, z.null()]).optional(),
  usage: z.union([UsageOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type IdleStateUpdate = z.output<typeof IdleStateUpdateSchema>;
