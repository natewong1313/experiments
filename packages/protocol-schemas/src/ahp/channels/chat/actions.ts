import * as z from "zod";
import {
  FileEditSchema,
  StringOrMarkdownSchema,
  UsageInfoSchema,
  metaSchema,
  uriSchema,
} from "../../common";
import { McpAuthRequirementSchema } from "../../primitives";
import {
  ChatInputAnswerSchema,
  ChatInputRequestSchema,
  ChatInputResponseKindSchema,
} from "./input";
import { MessageSchema } from "./message";
import { ErrorResponsePartSchema, ResponsePartSchema } from "./parts";
import { TurnSchema } from "./state";
import {
  ConfirmationOptionSchema,
  ToolCallContributorSchema,
  ToolCallResultSchema,
  ToolCallRiskAssessmentSchema,
  ToolInputSchema,
  ToolResultContentSchema,
} from "./tool-call";

const toolCallActionBaseFields = {
  turnId: z.string(),
  toolCallId: z.string(),
  _meta: metaSchema.optional(),
};

export const ChatTurnStartedActionSchema = z.strictObject({
  type: z.literal("chat/turnStarted"),
  turnId: z.string(),
  startedAt: z.string(),
  message: MessageSchema,
  queuedMessageId: z.string().optional(),
  _meta: metaSchema.optional(),
});

export const ChatDeltaActionSchema = z.strictObject({
  type: z.literal("chat/delta"),
  turnId: z.string(),
  partId: z.string(),
  content: z.string(),
  _meta: metaSchema.optional(),
});

export const ChatResponsePartActionSchema = z.strictObject({
  type: z.literal("chat/responsePart"),
  turnId: z.string(),
  part: ResponsePartSchema,
  _meta: metaSchema.optional(),
});

export const ChatToolCallStartActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallStart"),
  toolName: z.string(),
  displayName: z.string(),
  intention: z.string().optional(),
  contributor: ToolCallContributorSchema.optional(),
});

export const ChatToolCallDeltaActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallDelta"),
  content: z.string().optional(),
  invocationMessage: StringOrMarkdownSchema.optional(),
});

export const ChatToolCallReadyActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallReady"),
  contributor: ToolCallContributorSchema.optional(),
  intention: z.string().optional(),
  invocationMessage: StringOrMarkdownSchema,
  toolInput: ToolInputSchema.optional(),
  confirmationTitle: StringOrMarkdownSchema.optional(),
  riskAssessment: ToolCallRiskAssessmentSchema.optional(),
  edits: z.strictObject({ items: z.array(FileEditSchema) }).optional(),
  editable: z.boolean().optional(),
  confirmed: z.enum(["not-needed", "user-action", "setting"]).optional(),
  options: z.array(ConfirmationOptionSchema).optional(),
});

export const ChatToolCallApprovedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallConfirmed"),
  approved: z.literal(true),
  confirmed: z.enum(["not-needed", "user-action", "setting"]),
  editedToolInput: z.string().optional(),
  selectedOptionId: z.string().optional(),
});

export const ChatToolCallDeniedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallConfirmed"),
  approved: z.literal(false),
  reason: z.enum(["denied", "skipped"]),
  userSuggestion: MessageSchema.optional(),
  reasonMessage: StringOrMarkdownSchema.optional(),
  selectedOptionId: z.string().optional(),
});

export const ChatToolCallCompleteActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallComplete"),
  result: ToolCallResultSchema,
  requiresResultConfirmation: z.boolean().optional(),
});

export const ChatToolCallResultConfirmedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallResultConfirmed"),
  approved: z.boolean(),
});

export const ChatToolCallContentChangedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallContentChanged"),
  content: z.array(ToolResultContentSchema),
});

export const ChatToolCallAuthRequiredActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallAuthRequired"),
  auth: McpAuthRequirementSchema,
});

export const ChatToolCallAuthResolvedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallAuthResolved"),
});

export const ChatTurnCompleteActionSchema = z.strictObject({
  type: z.literal("chat/turnComplete"),
  turnId: z.string(),
  duration: z.number(),
  _meta: metaSchema.optional(),
});

export const ChatTurnCancelledActionSchema = z.strictObject({
  type: z.literal("chat/turnCancelled"),
  turnId: z.string(),
  duration: z.number(),
  _meta: metaSchema.optional(),
});

export const ChatErrorActionSchema = z.strictObject({
  type: z.literal("chat/error"),
  turnId: z.string(),
  duration: z.number(),
  part: ErrorResponsePartSchema,
  _meta: metaSchema.optional(),
});

export const ChatTurnResumeActionSchema = z.strictObject({
  type: z.literal("chat/turnResume"),
  turnId: z.string(),
});

export const ChatActivityChangedActionSchema = z.strictObject({
  type: z.literal("chat/activityChanged"),
  activity: z.string().optional(),
});

export const ChatWorkingDirectorySetActionSchema = z.strictObject({
  type: z.literal("chat/workingDirectorySet"),
  directory: uriSchema,
});

export const ChatWorkingDirectoryRemovedActionSchema = z.strictObject({
  type: z.literal("chat/workingDirectoryRemoved"),
  directory: uriSchema,
});

export const ChatUsageActionSchema = z.strictObject({
  type: z.literal("chat/usage"),
  turnId: z.string(),
  usage: UsageInfoSchema,
  _meta: metaSchema.optional(),
});

export const ChatReasoningActionSchema = z.strictObject({
  type: z.literal("chat/reasoning"),
  turnId: z.string(),
  partId: z.string(),
  content: z.string(),
  _meta: metaSchema.optional(),
});

export const ChatTruncatedActionSchema = z.strictObject({
  type: z.literal("chat/truncated"),
  turnId: z.string().optional(),
});

export const ChatTurnsLoadedActionSchema = z.strictObject({
  type: z.literal("chat/turnsLoaded"),
  turns: z.array(TurnSchema),
  turnsNextCursor: z.string().optional(),
});

export const ChatPendingMessageSetActionSchema = z.strictObject({
  type: z.literal("chat/pendingMessageSet"),
  kind: z.enum(["steering", "queued"]),
  id: z.string(),
  message: MessageSchema,
});

export const ChatPendingMessageRemovedActionSchema = z.strictObject({
  type: z.literal("chat/pendingMessageRemoved"),
  kind: z.enum(["steering", "queued"]),
  id: z.string(),
});

export const ChatQueuedMessagesReorderedActionSchema = z.strictObject({
  type: z.literal("chat/queuedMessagesReordered"),
  order: z.array(z.string()),
});

export const ChatDraftChangedActionSchema = z.strictObject({
  type: z.literal("chat/draftChanged"),
  draft: MessageSchema.optional(),
});

export const ChatInputRequestedActionSchema = z.strictObject({
  type: z.literal("chat/inputRequested"),
  request: ChatInputRequestSchema,
});

export const ChatInputAnswerChangedActionSchema = z.strictObject({
  type: z.literal("chat/inputAnswerChanged"),
  requestId: z.string(),
  questionId: z.string(),
  answer: ChatInputAnswerSchema.optional(),
});

export const ChatInputCompletedActionSchema = z.strictObject({
  type: z.literal("chat/inputCompleted"),
  requestId: z.string(),
  response: ChatInputResponseKindSchema,
  answers: z.record(z.string(), ChatInputAnswerSchema).optional(),
});

export const ChatActionSchema = z.union([
  ChatTurnStartedActionSchema,
  ChatDeltaActionSchema,
  ChatResponsePartActionSchema,
  ChatToolCallStartActionSchema,
  ChatToolCallDeltaActionSchema,
  ChatToolCallReadyActionSchema,
  ChatToolCallApprovedActionSchema,
  ChatToolCallDeniedActionSchema,
  ChatToolCallCompleteActionSchema,
  ChatToolCallResultConfirmedActionSchema,
  ChatToolCallContentChangedActionSchema,
  ChatToolCallAuthRequiredActionSchema,
  ChatToolCallAuthResolvedActionSchema,
  ChatTurnCompleteActionSchema,
  ChatTurnCancelledActionSchema,
  ChatErrorActionSchema,
  ChatTurnResumeActionSchema,
  ChatActivityChangedActionSchema,
  ChatWorkingDirectorySetActionSchema,
  ChatWorkingDirectoryRemovedActionSchema,
  ChatUsageActionSchema,
  ChatReasoningActionSchema,
  ChatTruncatedActionSchema,
  ChatTurnsLoadedActionSchema,
  ChatPendingMessageSetActionSchema,
  ChatPendingMessageRemovedActionSchema,
  ChatQueuedMessagesReorderedActionSchema,
  ChatDraftChangedActionSchema,
  ChatInputRequestedActionSchema,
  ChatInputAnswerChangedActionSchema,
  ChatInputCompletedActionSchema,
]);

export type ChatTurnStartedAction = z.output<typeof ChatTurnStartedActionSchema>;

export type ChatDeltaAction = z.output<typeof ChatDeltaActionSchema>;

export type ChatResponsePartAction = z.output<typeof ChatResponsePartActionSchema>;

export type ChatToolCallStartAction = z.output<typeof ChatToolCallStartActionSchema>;

export type ChatToolCallDeltaAction = z.output<typeof ChatToolCallDeltaActionSchema>;

export type ChatToolCallReadyAction = z.output<typeof ChatToolCallReadyActionSchema>;

export type ChatToolCallApprovedAction = z.output<typeof ChatToolCallApprovedActionSchema>;

export type ChatToolCallDeniedAction = z.output<typeof ChatToolCallDeniedActionSchema>;

export type ChatToolCallCompleteAction = z.output<typeof ChatToolCallCompleteActionSchema>;

export type ChatToolCallResultConfirmedAction = z.output<
  typeof ChatToolCallResultConfirmedActionSchema
>;

export type ChatToolCallContentChangedAction = z.output<
  typeof ChatToolCallContentChangedActionSchema
>;

export type ChatToolCallAuthRequiredAction = z.output<typeof ChatToolCallAuthRequiredActionSchema>;

export type ChatToolCallAuthResolvedAction = z.output<typeof ChatToolCallAuthResolvedActionSchema>;

export type ChatTurnCompleteAction = z.output<typeof ChatTurnCompleteActionSchema>;

export type ChatTurnCancelledAction = z.output<typeof ChatTurnCancelledActionSchema>;

export type ChatErrorAction = z.output<typeof ChatErrorActionSchema>;

export type ChatTurnResumeAction = z.output<typeof ChatTurnResumeActionSchema>;

export type ChatActivityChangedAction = z.output<typeof ChatActivityChangedActionSchema>;

export type ChatWorkingDirectorySetAction = z.output<typeof ChatWorkingDirectorySetActionSchema>;

export type ChatWorkingDirectoryRemovedAction = z.output<
  typeof ChatWorkingDirectoryRemovedActionSchema
>;

export type ChatUsageAction = z.output<typeof ChatUsageActionSchema>;

export type ChatReasoningAction = z.output<typeof ChatReasoningActionSchema>;

export type ChatTruncatedAction = z.output<typeof ChatTruncatedActionSchema>;

export type ChatTurnsLoadedAction = z.output<typeof ChatTurnsLoadedActionSchema>;

export type ChatPendingMessageSetAction = z.output<typeof ChatPendingMessageSetActionSchema>;

export type ChatPendingMessageRemovedAction = z.output<
  typeof ChatPendingMessageRemovedActionSchema
>;

export type ChatQueuedMessagesReorderedAction = z.output<
  typeof ChatQueuedMessagesReorderedActionSchema
>;

export type ChatDraftChangedAction = z.output<typeof ChatDraftChangedActionSchema>;

export type ChatInputRequestedAction = z.output<typeof ChatInputRequestedActionSchema>;

export type ChatInputAnswerChangedAction = z.output<typeof ChatInputAnswerChangedActionSchema>;

export type ChatInputCompletedAction = z.output<typeof ChatInputCompletedActionSchema>;

export type ChatAction = z.output<typeof ChatActionSchema>;
