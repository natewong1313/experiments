// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import { ToolCallIdSchema, ToolCallIdOutboundSchema } from "./schemas-0";
import { ToolKindSchema, ToolKindOutboundSchema } from "./schemas-0";
import { ToolCallStatusSchema, ToolCallStatusOutboundSchema } from "./schemas-0";
import { ToolCallContentSchema, ToolCallContentOutboundSchema } from "./schemas-1";
import { ContentBlockSchema, ContentBlockOutboundSchema } from "./schemas-0";
import { ToolCallLocationSchema, ToolCallLocationOutboundSchema } from "./schemas-1";
import { ElicitationIdSchema, ElicitationIdOutboundSchema } from "./schemas-2";
import { SessionModeIdSchema, SessionModeIdOutboundSchema } from "./schemas-5";
import { SessionConfigOptionSchema, SessionConfigOptionOutboundSchema } from "./schemas-5";
import { StopReasonSchema, StopReasonOutboundSchema } from "./schemas-6";
import { UsageSchema, UsageOutboundSchema } from "./schemas-6";
import { MessageIdSchema, MessageIdOutboundSchema } from "./schemas-7";
import { PlanEntrySchema, PlanEntryOutboundSchema } from "./schemas-7";
import { PlanUpdateContentSchema, PlanUpdateContentOutboundSchema } from "./schemas-7";
import { PlanIdSchema, PlanIdOutboundSchema } from "./schemas-7";
import { AvailableCommandSchema, AvailableCommandOutboundSchema } from "./schemas-8";
import { CostSchema, CostOutboundSchema } from "./schemas-8";
import { NoticeSeveritySchema, NoticeSeverityOutboundSchema } from "./schemas-8";
import { CompactionIdSchema, CompactionIdOutboundSchema } from "./schemas-8";
import { CompactionStatusSchema, CompactionStatusOutboundSchema } from "./schemas-8";
import {
  SubagentSessionCapabilitiesSchema,
  SubagentSessionCapabilitiesOutboundSchema,
} from "./schemas-8";
const RequiresActionStateUpdateSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const RequiresActionStateUpdateOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type RequiresActionStateUpdate = z.output<typeof RequiresActionStateUpdateSchema>;
const UnknownStateUpdateSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const UnknownStateUpdateOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type UnknownStateUpdate = z.output<typeof UnknownStateUpdateSchema>;
const StateUpdateSchema = z.union([
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
      { message: "Malformed known ACP variant" },
    ),
]);
const StateUpdateOutboundSchema = z.union([
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
      { message: "Malformed known ACP variant" },
    ),
]);
type StateUpdate = z.output<typeof StateUpdateSchema>;
const SubagentUpdateSchema = z.looseObject({
  sessionId: SessionIdSchema,
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  capabilities: z.union([SubagentSessionCapabilitiesSchema, z.null()]).optional(),
  state: z.union([StateUpdateSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SubagentUpdateOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  capabilities: z.union([SubagentSessionCapabilitiesOutboundSchema, z.null()]).optional(),
  state: z.union([StateUpdateOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SubagentUpdate = z.output<typeof SubagentUpdateSchema>;
const SessionMessageSchema = z.looseObject({
  messageId: MessageIdSchema,
  senderSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  content: z.union([z.array(ContentBlockSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionMessageOutboundSchema = z.strictObject({
  messageId: MessageIdOutboundSchema,
  senderSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  content: z.union([z.array(ContentBlockOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionMessage = z.output<typeof SessionMessageSchema>;
const SessionMessageChunkSchema = z.looseObject({
  messageId: MessageIdSchema,
  senderSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdSchema, z.null()]).optional(),
  content: ContentBlockSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionMessageChunkOutboundSchema = z.strictObject({
  messageId: MessageIdOutboundSchema,
  senderSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  recipientSessionId: z.union([SessionIdOutboundSchema, z.null()]).optional(),
  content: ContentBlockOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionMessageChunk = z.output<typeof SessionMessageChunkSchema>;
const SessionUpdateSchema = z.union([
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
    used: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
    size: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
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
const SessionUpdateOutboundSchema = z.union([
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
    used: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
    size: z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
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
type SessionUpdate = z.output<typeof SessionUpdateSchema>;
const SessionNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  update: SessionUpdateSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionNotificationOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  update: SessionUpdateOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionNotification = z.output<typeof SessionNotificationSchema>;
const CompleteElicitationNotificationSchema = z.looseObject({
  elicitationId: ElicitationIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CompleteElicitationNotificationOutboundSchema = z.strictObject({
  elicitationId: ElicitationIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CompleteElicitationNotification = z.output<typeof CompleteElicitationNotificationSchema>;
const ExtNotificationSchema = z.unknown();
const ExtNotificationOutboundSchema = z.unknown();
type ExtNotification = z.output<typeof ExtNotificationSchema>;
const AgentNotificationSchema = z.looseObject({
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
const AgentNotificationOutboundSchema = z.strictObject({
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
type AgentNotification = z.output<typeof AgentNotificationSchema>;
const FileSystemCapabilitiesSchema = z.looseObject({
  readTextFile: z.boolean().optional(),
  writeTextFile: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const FileSystemCapabilitiesOutboundSchema = z.strictObject({
  readTextFile: z.boolean().optional(),
  writeTextFile: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type FileSystemCapabilities = z.output<typeof FileSystemCapabilitiesSchema>;
const CompactionCapabilitiesSchema = z.looseObject({});
const CompactionCapabilitiesOutboundSchema = z.strictObject({});
type CompactionCapabilities = z.output<typeof CompactionCapabilitiesSchema>;
const BooleanConfigOptionCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const BooleanConfigOptionCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type BooleanConfigOptionCapabilities = z.output<typeof BooleanConfigOptionCapabilitiesSchema>;
const SessionConfigOptionsCapabilitiesSchema = z.looseObject({
  boolean: z.union([BooleanConfigOptionCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionConfigOptionsCapabilitiesOutboundSchema = z.strictObject({
  boolean: z.union([BooleanConfigOptionCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionConfigOptionsCapabilities = z.output<typeof SessionConfigOptionsCapabilitiesSchema>;
const NoticeCapabilitiesSchema = z.looseObject({});
const NoticeCapabilitiesOutboundSchema = z.strictObject({});
type NoticeCapabilities = z.output<typeof NoticeCapabilitiesSchema>;
const ClientSessionCapabilitiesSchema = z.looseObject({
  compaction: z.union([CompactionCapabilitiesSchema, z.null()]).optional(),
  configOptions: z.union([SessionConfigOptionsCapabilitiesSchema, z.null()]).optional(),
  notices: z.union([NoticeCapabilitiesSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ClientSessionCapabilitiesOutboundSchema = z.strictObject({
  compaction: z.union([CompactionCapabilitiesOutboundSchema, z.null()]).optional(),
  configOptions: z.union([SessionConfigOptionsCapabilitiesOutboundSchema, z.null()]).optional(),
  notices: z.union([NoticeCapabilitiesOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ClientSessionCapabilities = z.output<typeof ClientSessionCapabilitiesSchema>;
const SubagentCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SubagentCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SubagentCapabilities = z.output<typeof SubagentCapabilitiesSchema>;
const PlanCapabilitiesSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanCapabilitiesOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PlanCapabilities = z.output<typeof PlanCapabilitiesSchema>;
const AuthCapabilitiesSchema = z.looseObject({
  terminal: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AuthCapabilitiesOutboundSchema = z.strictObject({
  terminal: z.boolean().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type AuthCapabilities = z.output<typeof AuthCapabilitiesSchema>;
export {
  RequiresActionStateUpdateSchema,
  RequiresActionStateUpdateOutboundSchema,
  type RequiresActionStateUpdate,
  UnknownStateUpdateSchema,
  UnknownStateUpdateOutboundSchema,
  type UnknownStateUpdate,
  StateUpdateSchema,
  StateUpdateOutboundSchema,
  type StateUpdate,
  SubagentUpdateSchema,
  SubagentUpdateOutboundSchema,
  type SubagentUpdate,
  SessionMessageSchema,
  SessionMessageOutboundSchema,
  type SessionMessage,
  SessionMessageChunkSchema,
  SessionMessageChunkOutboundSchema,
  type SessionMessageChunk,
  SessionUpdateSchema,
  SessionUpdateOutboundSchema,
  type SessionUpdate,
  SessionNotificationSchema,
  SessionNotificationOutboundSchema,
  type SessionNotification,
  CompleteElicitationNotificationSchema,
  CompleteElicitationNotificationOutboundSchema,
  type CompleteElicitationNotification,
  ExtNotificationSchema,
  ExtNotificationOutboundSchema,
  type ExtNotification,
  AgentNotificationSchema,
  AgentNotificationOutboundSchema,
  type AgentNotification,
  FileSystemCapabilitiesSchema,
  FileSystemCapabilitiesOutboundSchema,
  type FileSystemCapabilities,
  CompactionCapabilitiesSchema,
  CompactionCapabilitiesOutboundSchema,
  type CompactionCapabilities,
  BooleanConfigOptionCapabilitiesSchema,
  BooleanConfigOptionCapabilitiesOutboundSchema,
  type BooleanConfigOptionCapabilities,
  SessionConfigOptionsCapabilitiesSchema,
  SessionConfigOptionsCapabilitiesOutboundSchema,
  type SessionConfigOptionsCapabilities,
  NoticeCapabilitiesSchema,
  NoticeCapabilitiesOutboundSchema,
  type NoticeCapabilities,
  ClientSessionCapabilitiesSchema,
  ClientSessionCapabilitiesOutboundSchema,
  type ClientSessionCapabilities,
  SubagentCapabilitiesSchema,
  SubagentCapabilitiesOutboundSchema,
  type SubagentCapabilities,
  PlanCapabilitiesSchema,
  PlanCapabilitiesOutboundSchema,
  type PlanCapabilities,
  AuthCapabilitiesSchema,
  AuthCapabilitiesOutboundSchema,
  type AuthCapabilities,
};
