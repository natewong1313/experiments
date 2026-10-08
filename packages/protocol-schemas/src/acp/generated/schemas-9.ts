// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import {
  SessionIdSchema,
  SessionIdOutboundSchema,
  ToolCallIdSchema,
  ToolCallIdOutboundSchema,
  ToolKindSchema,
  ToolKindOutboundSchema,
  ToolCallStatusSchema,
  ToolCallStatusOutboundSchema,
  ContentBlockSchema,
  ContentBlockOutboundSchema,
} from "./schemas-0";
import {
  ToolCallContentSchema,
  ToolCallContentOutboundSchema,
  ToolCallLocationSchema,
  ToolCallLocationOutboundSchema,
} from "./schemas-1";
import { ElicitationIdSchema, ElicitationIdOutboundSchema } from "./schemas-2";
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
import {
  MessageIdSchema,
  MessageIdOutboundSchema,
  PlanEntrySchema,
  PlanEntryOutboundSchema,
  PlanUpdateContentSchema,
  PlanUpdateContentOutboundSchema,
  PlanIdSchema,
  PlanIdOutboundSchema,
} from "./schemas-7";
import {
  AvailableCommandSchema,
  AvailableCommandOutboundSchema,
  CostSchema,
  CostOutboundSchema,
  NoticeSeveritySchema,
  NoticeSeverityOutboundSchema,
  CompactionIdSchema,
  CompactionIdOutboundSchema,
  CompactionStatusSchema,
  CompactionStatusOutboundSchema,
  SubagentSessionCapabilitiesSchema,
  SubagentSessionCapabilitiesOutboundSchema,
} from "./schemas-8";

export const RequiresActionStateUpdateSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const RequiresActionStateUpdateOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type RequiresActionStateUpdate = z.output<typeof RequiresActionStateUpdateSchema>;

export const UnknownStateUpdateSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const UnknownStateUpdateOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type UnknownStateUpdate = z.output<typeof UnknownStateUpdateSchema>;

export const StateUpdateSchema = z.union([
  z.looseObject({
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("running"),
  }),
  z.looseObject({
    stopReason: z.union([StopReasonSchema, z.null()]).optional(),
    usage: z.union([UsageSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("idle"),
  }),
  z.looseObject({
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("requires_action"),
  }),
  z.looseObject({
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("unknown"),
  }),
  z
    .looseObject({ state: z.string() })
    .refine(
      (value) => !["running", "idle", "requires_action", "unknown"].includes(value["state"]),
      { error: "Malformed known ACP variant" },
    ),
]);

export const StateUpdateOutboundSchema = z.union([
  z.strictObject({
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("running"),
  }),
  z.strictObject({
    stopReason: z.union([StopReasonOutboundSchema, z.null()]).optional(),
    usage: z.union([UsageOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("idle"),
  }),
  z.strictObject({
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("requires_action"),
  }),
  z.strictObject({
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    state: z.literal("unknown"),
  }),
  z
    .looseObject({ state: z.string() })
    .refine(
      (value) => !["running", "idle", "requires_action", "unknown"].includes(value["state"]),
      { error: "Malformed known ACP variant" },
    ),
]);

export type StateUpdate = z.output<typeof StateUpdateSchema>;

export const SubagentUpdateSchema = z.looseObject({
  sessionId: SessionIdSchema,
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  capabilities: z.union([SubagentSessionCapabilitiesSchema, z.null()]).optional(),
  state: z.union([StateUpdateSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SubagentUpdateOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  capabilities: z.union([SubagentSessionCapabilitiesOutboundSchema, z.null()]).optional(),
  state: z.union([StateUpdateOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SubagentUpdate = z.output<typeof SubagentUpdateSchema>;

export const SessionMessageSchema = z.looseObject({
  messageId: MessageIdSchema,
  senderSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  content: z.union([z.array(ContentBlockSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionMessageOutboundSchema = z.strictObject({
  messageId: MessageIdOutboundSchema,
  senderSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  content: z.union([z.array(ContentBlockOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionMessage = z.output<typeof SessionMessageSchema>;

export const SessionMessageChunkSchema = z.looseObject({
  messageId: MessageIdSchema,
  senderSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  content: ContentBlockSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionMessageChunkOutboundSchema = z.strictObject({
  messageId: MessageIdOutboundSchema,
  senderSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  content: ContentBlockOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionMessageChunk = z.output<typeof SessionMessageChunkSchema>;

export const SessionUpdateSchema = z.union([
  z.looseObject({
    content: ContentBlockSchema,
    messageId: z.union([MessageIdSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("user_message_chunk"),
  }),
  z.looseObject({
    content: ContentBlockSchema,
    messageId: z.union([MessageIdSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("agent_message_chunk"),
  }),
  z.looseObject({
    content: ContentBlockSchema,
    messageId: z.union([MessageIdSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("agent_thought_chunk"),
  }),
  z.looseObject({
    toolCallId: ToolCallIdSchema,
    title: z.string(),
    name: z.union([z.string(), z.null()]).optional(),
    kind: ToolKindSchema.optional(),
    status: ToolCallStatusSchema.optional(),
    content: z.array(ToolCallContentSchema).optional(),
    locations: z.array(ToolCallLocationSchema).optional(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("tool_call"),
  }),
  z.looseObject({
    toolCallId: ToolCallIdSchema,
    kind: z.union([ToolKindSchema, z.null()]).optional(),
    status: z.union([ToolCallStatusSchema, z.null()]).optional(),
    title: z.union([z.string(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    content: z.union([z.array(ToolCallContentSchema), z.null()]).optional(),
    locations: z.union([z.array(ToolCallLocationSchema), z.null()]).optional(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("tool_call_update"),
  }),
  z.looseObject({
    entries: z.array(PlanEntrySchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("plan"),
  }),
  z.looseObject({
    plan: PlanUpdateContentSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("plan_update"),
  }),
  z.looseObject({
    planId: PlanIdSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("plan_removed"),
  }),
  z.looseObject({
    availableCommands: z.array(AvailableCommandSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("available_commands_update"),
  }),
  z.looseObject({
    currentModeId: SessionModeIdSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("current_mode_update"),
  }),
  z.looseObject({
    configOptions: z.array(SessionConfigOptionSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("config_option_update"),
  }),
  z.looseObject({
    title: z.union([z.string(), z.null()]).optional(),
    updatedAt: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("session_info_update"),
  }),
  z.looseObject({
    used: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
    size: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
    cost: z.union([CostSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("usage_update"),
  }),
  z.looseObject({
    severity: NoticeSeveritySchema,
    title: z.string().min(1),
    description: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("notice"),
  }),
  z.looseObject({
    compactionId: CompactionIdSchema,
    status: CompactionStatusSchema,
    summary: z.union([z.array(ContentBlockSchema), z.null()]).optional(),
    error: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("compaction_update"),
  }),
  z.looseObject({
    compactionId: CompactionIdSchema,
    content: ContentBlockSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("compaction_summary_chunk"),
  }),
  z.looseObject({
    sessionId: SessionIdSchema,
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    capabilities: z.union([SubagentSessionCapabilitiesSchema, z.null()]).optional(),
    state: z.union([StateUpdateSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("subagent_update"),
  }),
  z.looseObject({
    messageId: MessageIdSchema,
    senderSessionId: z.union([SessionIdSchema, z.null()]).optional(),
    recipientSessionId: z.union([SessionIdSchema, z.null()]).optional(),
    content: z.union([z.array(ContentBlockSchema), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("session_message"),
  }),
  z.looseObject({
    messageId: MessageIdSchema,
    senderSessionId: z.union([SessionIdSchema, z.null()]).optional(),
    recipientSessionId: z.union([SessionIdSchema, z.null()]).optional(),
    content: ContentBlockSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("session_message_chunk"),
  }),
]);

export const SessionUpdateOutboundSchema = z.union([
  z.strictObject({
    content: ContentBlockOutboundSchema,
    messageId: z.union([MessageIdOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("user_message_chunk"),
  }),
  z.strictObject({
    content: ContentBlockOutboundSchema,
    messageId: z.union([MessageIdOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("agent_message_chunk"),
  }),
  z.strictObject({
    content: ContentBlockOutboundSchema,
    messageId: z.union([MessageIdOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("agent_thought_chunk"),
  }),
  z.strictObject({
    toolCallId: ToolCallIdOutboundSchema,
    title: z.string(),
    name: z.union([z.string(), z.null()]).optional(),
    kind: ToolKindOutboundSchema.optional(),
    status: ToolCallStatusOutboundSchema.optional(),
    content: z.array(ToolCallContentOutboundSchema).optional(),
    locations: z.array(ToolCallLocationOutboundSchema).optional(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("tool_call"),
  }),
  z.strictObject({
    toolCallId: ToolCallIdOutboundSchema,
    kind: z.union([ToolKindOutboundSchema, z.null()]).optional(),
    status: z.union([ToolCallStatusOutboundSchema, z.null()]).optional(),
    title: z.union([z.string(), z.null()]).optional(),
    name: z.union([z.string(), z.null()]).optional(),
    content: z.union([z.array(ToolCallContentOutboundSchema), z.null()]).optional(),
    locations: z.union([z.array(ToolCallLocationOutboundSchema), z.null()]).optional(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("tool_call_update"),
  }),
  z.strictObject({
    entries: z.array(PlanEntryOutboundSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("plan"),
  }),
  z.strictObject({
    plan: PlanUpdateContentOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("plan_update"),
  }),
  z.strictObject({
    planId: PlanIdOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("plan_removed"),
  }),
  z.strictObject({
    availableCommands: z.array(AvailableCommandOutboundSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("available_commands_update"),
  }),
  z.strictObject({
    currentModeId: SessionModeIdOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("current_mode_update"),
  }),
  z.strictObject({
    configOptions: z.array(SessionConfigOptionOutboundSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("config_option_update"),
  }),
  z.strictObject({
    title: z.union([z.string(), z.null()]).optional(),
    updatedAt: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("session_info_update"),
  }),
  z.strictObject({
    used: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
    size: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
    cost: z.union([CostOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("usage_update"),
  }),
  z.strictObject({
    severity: NoticeSeverityOutboundSchema,
    title: z.string().min(1),
    description: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("notice"),
  }),
  z.strictObject({
    compactionId: CompactionIdOutboundSchema,
    status: CompactionStatusOutboundSchema,
    summary: z.union([z.array(ContentBlockOutboundSchema), z.null()]).optional(),
    error: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("compaction_update"),
  }),
  z.strictObject({
    compactionId: CompactionIdOutboundSchema,
    content: ContentBlockOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("compaction_summary_chunk"),
  }),
  z.strictObject({
    sessionId: SessionIdOutboundSchema,
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    capabilities: z.union([SubagentSessionCapabilitiesOutboundSchema, z.null()]).optional(),
    state: z.union([StateUpdateOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("subagent_update"),
  }),
  z.strictObject({
    messageId: MessageIdOutboundSchema,
    senderSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
    recipientSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
    content: z.union([z.array(ContentBlockOutboundSchema), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("session_message"),
  }),
  z.strictObject({
    messageId: MessageIdOutboundSchema,
    senderSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
    recipientSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
    content: ContentBlockOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    sessionUpdate: z.literal("session_message_chunk"),
  }),
]);

export type SessionUpdate = z.output<typeof SessionUpdateSchema>;

export const SessionNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  update: SessionUpdateSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  update: SessionUpdateOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionNotification = z.output<typeof SessionNotificationSchema>;

export const CompleteElicitationNotificationSchema = z.looseObject({
  elicitationId: ElicitationIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CompleteElicitationNotificationOutboundSchema = z.strictObject({
  elicitationId: ElicitationIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CompleteElicitationNotification = z.output<
  typeof CompleteElicitationNotificationSchema
>;

export const ExtNotificationSchema = z.unknown();

export const ExtNotificationOutboundSchema = z.unknown();

export type ExtNotification = z.output<typeof ExtNotificationSchema>;

export const AgentNotificationSchema = z.looseObject({
  method: z.string(),
  params: z
    .union([
      z.union([
        SessionNotificationSchema,
        CompleteElicitationNotificationSchema,
        ExtNotificationSchema,
      ]),
      z.null(),
    ])
    .optional(),
});

export const AgentNotificationOutboundSchema = z.strictObject({
  method: z.string(),
  params: z
    .union([
      z.union([
        SessionNotificationOutboundSchema,
        CompleteElicitationNotificationOutboundSchema,
        ExtNotificationOutboundSchema,
      ]),
      z.null(),
    ])
    .optional(),
});

export type AgentNotification = z.output<typeof AgentNotificationSchema>;

export const FileSystemCapabilitiesSchema = z.looseObject({
  readTextFile: z.boolean().optional(),
  writeTextFile: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const FileSystemCapabilitiesOutboundSchema = z.strictObject({
  readTextFile: z.boolean().optional(),
  writeTextFile: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type FileSystemCapabilities = z.output<typeof FileSystemCapabilitiesSchema>;

export const CompactionCapabilitiesSchema = z.looseObject({});

export const CompactionCapabilitiesOutboundSchema = z.strictObject({});

export type CompactionCapabilities = z.output<typeof CompactionCapabilitiesSchema>;

export const BooleanConfigOptionCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const BooleanConfigOptionCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type BooleanConfigOptionCapabilities = z.output<
  typeof BooleanConfigOptionCapabilitiesSchema
>;

export const SessionConfigOptionsCapabilitiesSchema = z.looseObject({
  boolean: z.union([BooleanConfigOptionCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionConfigOptionsCapabilitiesOutboundSchema = z.strictObject({
  boolean: z.union([BooleanConfigOptionCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionConfigOptionsCapabilities = z.output<
  typeof SessionConfigOptionsCapabilitiesSchema
>;

export const NoticeCapabilitiesSchema = z.looseObject({});

export const NoticeCapabilitiesOutboundSchema = z.strictObject({});

export type NoticeCapabilities = z.output<typeof NoticeCapabilitiesSchema>;

export const ClientSessionCapabilitiesSchema = z.looseObject({
  compaction: z.union([CompactionCapabilitiesSchema, z.null()]).optional(),
  configOptions: z.union([SessionConfigOptionsCapabilitiesSchema, z.null()]).optional(),
  notices: z.union([NoticeCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ClientSessionCapabilitiesOutboundSchema = z.strictObject({
  compaction: z.union([CompactionCapabilitiesOutboundSchema, z.null()]).optional(),
  configOptions: z.union([SessionConfigOptionsCapabilitiesOutboundSchema, z.null()]).optional(),
  notices: z.union([NoticeCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ClientSessionCapabilities = z.output<typeof ClientSessionCapabilitiesSchema>;

export const SubagentCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SubagentCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SubagentCapabilities = z.output<typeof SubagentCapabilitiesSchema>;

export const PlanCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PlanCapabilities = z.output<typeof PlanCapabilitiesSchema>;

export const AuthCapabilitiesSchema = z.looseObject({
  terminal: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AuthCapabilitiesOutboundSchema = z.strictObject({
  terminal: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AuthCapabilities = z.output<typeof AuthCapabilitiesSchema>;
