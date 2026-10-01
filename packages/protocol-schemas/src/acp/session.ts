import * as z from "zod";

const SessionIdSchema = z.string();
const NewSessionRequestSchema = z.strictObject({
  cwd: z.string(),
  mcpServers: z.tuple([]),
});
const LoadSessionRequestSchema = NewSessionRequestSchema.extend({
  sessionId: SessionIdSchema,
});
const NewSessionResponseSchema = z.looseObject({
  sessionId: SessionIdSchema,
});
const LoadSessionResponseSchema = z.looseObject({});

const TextContentSchema = z.looseObject({
  type: z.literal("text"),
  text: z.string(),
});
// Non-text payloads are preserved but ignored by the host's text-only mapping.
const ContentBlockSchema = z.discriminatedUnion("type", [
  TextContentSchema,
  z.looseObject({
    type: z.enum(["image", "audio", "resource", "resource_link"]),
  }),
]);
const ToolCallContentSchema = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("content"),
    content: ContentBlockSchema,
  }),
  z.looseObject({ type: z.enum(["diff", "terminal"]) }),
]);
const ToolKindSchema = z.enum([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);
const ToolCallStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
const AgentMessageChunkSchema = z.looseObject({
  sessionUpdate: z.literal("agent_message_chunk"),
  content: ContentBlockSchema,
});
const AgentThoughtChunkSchema = AgentMessageChunkSchema.extend({
  sessionUpdate: z.literal("agent_thought_chunk"),
});
const ToolCallSchema = z.looseObject({
  sessionUpdate: z.literal("tool_call"),
  toolCallId: z.string(),
  title: z.string(),
  kind: ToolKindSchema.optional(),
  status: ToolCallStatusSchema.optional(),
  content: z.array(ToolCallContentSchema).optional(),
  rawInput: z.unknown().optional(),
});
const ToolCallUpdateSchema = z.looseObject({
  sessionUpdate: z.literal("tool_call_update"),
  toolCallId: z.string(),
  title: z.string().nullish(),
  kind: ToolKindSchema.nullish(),
  status: ToolCallStatusSchema.nullish(),
  content: z.array(ToolCallContentSchema).nullish(),
  rawInput: z.unknown().optional(),
});
const SessionUpdateSchema = z.discriminatedUnion("sessionUpdate", [
  AgentMessageChunkSchema,
  AgentThoughtChunkSchema,
  ToolCallSchema,
  ToolCallUpdateSchema,
]);
const SessionNotificationSchema = z.looseObject({
  sessionId: SessionIdSchema,
  update: SessionUpdateSchema,
});

type SessionId = z.output<typeof SessionIdSchema>;
type NewSessionRequest = z.output<typeof NewSessionRequestSchema>;
type LoadSessionRequest = z.output<typeof LoadSessionRequestSchema>;
type NewSessionResponse = z.output<typeof NewSessionResponseSchema>;
type LoadSessionResponse = z.output<typeof LoadSessionResponseSchema>;
type TextContent = z.output<typeof TextContentSchema>;
type ContentBlock = z.output<typeof ContentBlockSchema>;
type ToolCallContent = z.output<typeof ToolCallContentSchema>;
type ToolKind = z.output<typeof ToolKindSchema>;
type ToolCallStatus = z.output<typeof ToolCallStatusSchema>;
type SessionUpdate = z.output<typeof SessionUpdateSchema>;
type SessionNotification = z.output<typeof SessionNotificationSchema>;

export {
  ContentBlockSchema,
  LoadSessionRequestSchema,
  LoadSessionResponseSchema,
  NewSessionRequestSchema,
  NewSessionResponseSchema,
  SessionIdSchema,
  SessionNotificationSchema,
  SessionUpdateSchema,
  TextContentSchema,
  ToolCallContentSchema,
  ToolCallStatusSchema,
  ToolKindSchema,
  type ContentBlock,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type SessionId,
  type SessionNotification,
  type SessionUpdate,
  type TextContent,
  type ToolCallContent,
  type ToolCallStatus,
  type ToolKind,
};
