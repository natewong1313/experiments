// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { ContentBlockSchema, ContentBlockOutboundSchema } from "./schemas-0";
import { SessionModeIdSchema, SessionModeIdOutboundSchema } from "./schemas-5";
import { SessionConfigOptionSchema, SessionConfigOptionOutboundSchema } from "./schemas-5";
import { StopReasonSchema, StopReasonOutboundSchema } from "./schemas-6";
import { UsageSchema, UsageOutboundSchema } from "./schemas-6";
import { PlanIdSchema, PlanIdOutboundSchema } from "./schemas-7";
const PlanRemovedSchema = z.looseObject({
  planId: PlanIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanRemovedOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PlanRemoved = z.output<typeof PlanRemovedSchema>;
const UnstructuredCommandInputSchema = z.looseObject({
  hint: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const UnstructuredCommandInputOutboundSchema = z.strictObject({
  hint: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type UnstructuredCommandInput = z.output<typeof UnstructuredCommandInputSchema>;
const AvailableCommandInputSchema = UnstructuredCommandInputSchema;
const AvailableCommandInputOutboundSchema = UnstructuredCommandInputOutboundSchema;
type AvailableCommandInput = z.output<typeof AvailableCommandInputSchema>;
const AvailableCommandSchema = z.looseObject({
  name: z.string(),
  description: z.string(),
  input: z.union([AvailableCommandInputSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AvailableCommandOutboundSchema = z.strictObject({
  name: z.string(),
  description: z.string(),
  input: z.union([AvailableCommandInputOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type AvailableCommand = z.output<typeof AvailableCommandSchema>;
const AvailableCommandsUpdateSchema = z.looseObject({
  availableCommands: z.array(AvailableCommandSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AvailableCommandsUpdateOutboundSchema = z.strictObject({
  availableCommands: z.array(AvailableCommandOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type AvailableCommandsUpdate = z.output<typeof AvailableCommandsUpdateSchema>;
const CurrentModeUpdateSchema = z.looseObject({
  currentModeId: SessionModeIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CurrentModeUpdateOutboundSchema = z.strictObject({
  currentModeId: SessionModeIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CurrentModeUpdate = z.output<typeof CurrentModeUpdateSchema>;
const ConfigOptionUpdateSchema = z.looseObject({
  configOptions: z.array(SessionConfigOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ConfigOptionUpdateOutboundSchema = z.strictObject({
  configOptions: z.array(SessionConfigOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ConfigOptionUpdate = z.output<typeof ConfigOptionUpdateSchema>;
const SessionInfoUpdateSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionInfoUpdateOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionInfoUpdate = z.output<typeof SessionInfoUpdateSchema>;
const CostSchema = z.looseObject({
  amount: z.number(),
  currency: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CostOutboundSchema = z.strictObject({
  amount: z.number(),
  currency: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type Cost = z.output<typeof CostSchema>;
const UsageUpdateSchema = z.looseObject({
  used: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
  size: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
  cost: z.union([CostSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const UsageUpdateOutboundSchema = z.strictObject({
  used: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
  size: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
  cost: z.union([CostOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type UsageUpdate = z.output<typeof UsageUpdateSchema>;
const NoticeSeveritySchema = z.union([
  z.literal("info"),
  z.literal("warning"),
  z.literal("error"),
  z.string(),
]);
const NoticeSeverityOutboundSchema = z.union([
  z.literal("info"),
  z.literal("warning"),
  z.literal("error"),
  z.string(),
]);
type NoticeSeverity = z.output<typeof NoticeSeveritySchema>;
const NoticeSchema = z.looseObject({
  severity: NoticeSeveritySchema,
  title: z.string().min(1),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NoticeOutboundSchema = z.strictObject({
  severity: NoticeSeverityOutboundSchema,
  title: z.string().min(1),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type Notice = z.output<typeof NoticeSchema>;
const CompactionIdSchema = z.string();
const CompactionIdOutboundSchema = z.string();
type CompactionId = z.output<typeof CompactionIdSchema>;
const CompactionStatusSchema = z.union([
  z.literal("in_progress"),
  z.literal("completed"),
  z.literal("failed"),
  z.literal("cancelled"),
  z.string(),
]);
const CompactionStatusOutboundSchema = z.union([
  z.literal("in_progress"),
  z.literal("completed"),
  z.literal("failed"),
  z.literal("cancelled"),
  z.string(),
]);
type CompactionStatus = z.output<typeof CompactionStatusSchema>;
const CompactionUpdateSchema = z.looseObject({
  compactionId: CompactionIdSchema,
  status: CompactionStatusSchema,
  summary: z.union([z.array(ContentBlockSchema), z.null()]).optional(),
  error: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CompactionUpdateOutboundSchema = z.strictObject({
  compactionId: CompactionIdOutboundSchema,
  status: CompactionStatusOutboundSchema,
  summary: z.union([z.array(ContentBlockOutboundSchema), z.null()]).optional(),
  error: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CompactionUpdate = z.output<typeof CompactionUpdateSchema>;
const CompactionSummaryChunkSchema = z.looseObject({
  compactionId: CompactionIdSchema,
  content: ContentBlockSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CompactionSummaryChunkOutboundSchema = z.strictObject({
  compactionId: CompactionIdOutboundSchema,
  content: ContentBlockOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CompactionSummaryChunk = z.output<typeof CompactionSummaryChunkSchema>;
const SessionCancelCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionCancelCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionCancelCapabilities = z.output<typeof SessionCancelCapabilitiesSchema>;
const SubagentSessionCapabilitiesSchema = z.looseObject({
  cancel: z.union([SessionCancelCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SubagentSessionCapabilitiesOutboundSchema = z.strictObject({
  cancel: z.union([SessionCancelCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SubagentSessionCapabilities = z.output<typeof SubagentSessionCapabilitiesSchema>;
const RunningStateUpdateSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const RunningStateUpdateOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type RunningStateUpdate = z.output<typeof RunningStateUpdateSchema>;
const IdleStateUpdateSchema = z.looseObject({
  stopReason: z.union([StopReasonSchema, z.null()]).optional(),
  usage: z.union([UsageSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const IdleStateUpdateOutboundSchema = z.strictObject({
  stopReason: z.union([StopReasonOutboundSchema, z.null()]).optional(),
  usage: z.union([UsageOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type IdleStateUpdate = z.output<typeof IdleStateUpdateSchema>;
export {
  PlanRemovedSchema,
  PlanRemovedOutboundSchema,
  type PlanRemoved,
  UnstructuredCommandInputSchema,
  UnstructuredCommandInputOutboundSchema,
  type UnstructuredCommandInput,
  AvailableCommandInputSchema,
  AvailableCommandInputOutboundSchema,
  type AvailableCommandInput,
  AvailableCommandSchema,
  AvailableCommandOutboundSchema,
  type AvailableCommand,
  AvailableCommandsUpdateSchema,
  AvailableCommandsUpdateOutboundSchema,
  type AvailableCommandsUpdate,
  CurrentModeUpdateSchema,
  CurrentModeUpdateOutboundSchema,
  type CurrentModeUpdate,
  ConfigOptionUpdateSchema,
  ConfigOptionUpdateOutboundSchema,
  type ConfigOptionUpdate,
  SessionInfoUpdateSchema,
  SessionInfoUpdateOutboundSchema,
  type SessionInfoUpdate,
  CostSchema,
  CostOutboundSchema,
  type Cost,
  UsageUpdateSchema,
  UsageUpdateOutboundSchema,
  type UsageUpdate,
  NoticeSeveritySchema,
  NoticeSeverityOutboundSchema,
  type NoticeSeverity,
  NoticeSchema,
  NoticeOutboundSchema,
  type Notice,
  CompactionIdSchema,
  CompactionIdOutboundSchema,
  type CompactionId,
  CompactionStatusSchema,
  CompactionStatusOutboundSchema,
  type CompactionStatus,
  CompactionUpdateSchema,
  CompactionUpdateOutboundSchema,
  type CompactionUpdate,
  CompactionSummaryChunkSchema,
  CompactionSummaryChunkOutboundSchema,
  type CompactionSummaryChunk,
  SessionCancelCapabilitiesSchema,
  SessionCancelCapabilitiesOutboundSchema,
  type SessionCancelCapabilities,
  SubagentSessionCapabilitiesSchema,
  SubagentSessionCapabilitiesOutboundSchema,
  type SubagentSessionCapabilities,
  RunningStateUpdateSchema,
  RunningStateUpdateOutboundSchema,
  type RunningStateUpdate,
  IdleStateUpdateSchema,
  IdleStateUpdateOutboundSchema,
  type IdleStateUpdate,
};
