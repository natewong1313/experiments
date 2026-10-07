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

const ChatTurnStartedActionSchema = z.strictObject({
  type: z.literal("chat/turnStarted"),
  turnId: z.string(),
  startedAt: z.string(),
  message: MessageSchema,
  queuedMessageId: z.string().optional(),
  _meta: metaSchema.optional(),
});

const ChatDeltaActionSchema = z.strictObject({
  type: z.literal("chat/delta"),
  turnId: z.string(),
  partId: z.string(),
  content: z.string(),
  _meta: metaSchema.optional(),
});

const ChatResponsePartActionSchema = z.strictObject({
  type: z.literal("chat/responsePart"),
  turnId: z.string(),
  part: ResponsePartSchema,
  _meta: metaSchema.optional(),
});

const ChatToolCallStartActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallStart"),
  toolName: z.string(),
  displayName: z.string(),
  intention: z.string().optional(),
  contributor: ToolCallContributorSchema.optional(),
});

const ChatToolCallDeltaActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallDelta"),
  content: z.string().optional(),
  invocationMessage: StringOrMarkdownSchema.optional(),
});

const ChatToolCallReadyActionSchema = z.strictObject({
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

const ChatToolCallApprovedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallConfirmed"),
  approved: z.literal(true),
  confirmed: z.enum(["not-needed", "user-action", "setting"]),
  editedToolInput: z.string().optional(),
  selectedOptionId: z.string().optional(),
});

const ChatToolCallDeniedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallConfirmed"),
  approved: z.literal(false),
  reason: z.enum(["denied", "skipped"]),
  userSuggestion: MessageSchema.optional(),
  reasonMessage: StringOrMarkdownSchema.optional(),
  selectedOptionId: z.string().optional(),
});

const ChatToolCallCompleteActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallComplete"),
  result: ToolCallResultSchema,
  requiresResultConfirmation: z.boolean().optional(),
});

const ChatToolCallResultConfirmedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallResultConfirmed"),
  approved: z.boolean(),
});

const ChatToolCallContentChangedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallContentChanged"),
  content: z.array(ToolResultContentSchema),
});

const ChatToolCallAuthRequiredActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallAuthRequired"),
  auth: McpAuthRequirementSchema,
});

const ChatToolCallAuthResolvedActionSchema = z.strictObject({
  ...toolCallActionBaseFields,
  type: z.literal("chat/toolCallAuthResolved"),
});

const ChatTurnCompleteActionSchema = z.strictObject({
  type: z.literal("chat/turnComplete"),
  turnId: z.string(),
  duration: z.number(),
  _meta: metaSchema.optional(),
});

const ChatTurnCancelledActionSchema = z.strictObject({
  type: z.literal("chat/turnCancelled"),
  turnId: z.string(),
  duration: z.number(),
  _meta: metaSchema.optional(),
});

const ChatErrorActionSchema = z.strictObject({
  type: z.literal("chat/error"),
  turnId: z.string(),
  duration: z.number(),
  part: ErrorResponsePartSchema,
  _meta: metaSchema.optional(),
});

const ChatTurnResumeActionSchema = z.strictObject({
  type: z.literal("chat/turnResume"),
  turnId: z.string(),
});

const ChatActivityChangedActionSchema = z.strictObject({
  type: z.literal("chat/activityChanged"),
  activity: z.string().optional(),
});

const ChatWorkingDirectorySetActionSchema = z.strictObject({
  type: z.literal("chat/workingDirectorySet"),
  directory: uriSchema,
});

const ChatWorkingDirectoryRemovedActionSchema = z.strictObject({
  type: z.literal("chat/workingDirectoryRemoved"),
  directory: uriSchema,
});

const ChatUsageActionSchema = z.strictObject({
  type: z.literal("chat/usage"),
  turnId: z.string(),
  usage: UsageInfoSchema,
  _meta: metaSchema.optional(),
});

const ChatReasoningActionSchema = z.strictObject({
  type: z.literal("chat/reasoning"),
  turnId: z.string(),
  partId: z.string(),
  content: z.string(),
  _meta: metaSchema.optional(),
});

const ChatTruncatedActionSchema = z.strictObject({
  type: z.literal("chat/truncated"),
  turnId: z.string().optional(),
});

const ChatTurnsLoadedActionSchema = z.strictObject({
  type: z.literal("chat/turnsLoaded"),
  turns: z.array(TurnSchema),
  turnsNextCursor: z.string().optional(),
});

const ChatPendingMessageSetActionSchema = z.strictObject({
  type: z.literal("chat/pendingMessageSet"),
  kind: z.enum(["steering", "queued"]),
  id: z.string(),
  message: MessageSchema,
});

const ChatPendingMessageRemovedActionSchema = z.strictObject({
  type: z.literal("chat/pendingMessageRemoved"),
  kind: z.enum(["steering", "queued"]),
  id: z.string(),
});

const ChatQueuedMessagesReorderedActionSchema = z.strictObject({
  type: z.literal("chat/queuedMessagesReordered"),
  order: z.array(z.string()),
});

const ChatDraftChangedActionSchema = z.strictObject({
  type: z.literal("chat/draftChanged"),
  draft: MessageSchema.optional(),
});

const ChatInputRequestedActionSchema = z.strictObject({
  type: z.literal("chat/inputRequested"),
  request: ChatInputRequestSchema,
});

const ChatInputAnswerChangedActionSchema = z.strictObject({
  type: z.literal("chat/inputAnswerChanged"),
  requestId: z.string(),
  questionId: z.string(),
  answer: ChatInputAnswerSchema.optional(),
});

const ChatInputCompletedActionSchema = z.strictObject({
  type: z.literal("chat/inputCompleted"),
  requestId: z.string(),
  response: ChatInputResponseKindSchema,
  answers: z.record(z.string(), ChatInputAnswerSchema).optional(),
});

const ChatActionSchema = z.union([
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

type ChatTurnStartedAction = z.output<typeof ChatTurnStartedActionSchema>;

type ChatDeltaAction = z.output<typeof ChatDeltaActionSchema>;

type ChatResponsePartAction = z.output<typeof ChatResponsePartActionSchema>;

type ChatToolCallStartAction = z.output<typeof ChatToolCallStartActionSchema>;

type ChatToolCallDeltaAction = z.output<typeof ChatToolCallDeltaActionSchema>;

type ChatToolCallReadyAction = z.output<typeof ChatToolCallReadyActionSchema>;

type ChatToolCallApprovedAction = z.output<typeof ChatToolCallApprovedActionSchema>;

type ChatToolCallDeniedAction = z.output<typeof ChatToolCallDeniedActionSchema>;

type ChatToolCallCompleteAction = z.output<typeof ChatToolCallCompleteActionSchema>;

type ChatToolCallResultConfirmedAction = z.output<typeof ChatToolCallResultConfirmedActionSchema>;

type ChatToolCallContentChangedAction = z.output<typeof ChatToolCallContentChangedActionSchema>;

type ChatToolCallAuthRequiredAction = z.output<typeof ChatToolCallAuthRequiredActionSchema>;

type ChatToolCallAuthResolvedAction = z.output<typeof ChatToolCallAuthResolvedActionSchema>;

type ChatTurnCompleteAction = z.output<typeof ChatTurnCompleteActionSchema>;

type ChatTurnCancelledAction = z.output<typeof ChatTurnCancelledActionSchema>;

type ChatErrorAction = z.output<typeof ChatErrorActionSchema>;

type ChatTurnResumeAction = z.output<typeof ChatTurnResumeActionSchema>;

type ChatActivityChangedAction = z.output<typeof ChatActivityChangedActionSchema>;

type ChatWorkingDirectorySetAction = z.output<typeof ChatWorkingDirectorySetActionSchema>;

type ChatWorkingDirectoryRemovedAction = z.output<typeof ChatWorkingDirectoryRemovedActionSchema>;

type ChatUsageAction = z.output<typeof ChatUsageActionSchema>;

type ChatReasoningAction = z.output<typeof ChatReasoningActionSchema>;

type ChatTruncatedAction = z.output<typeof ChatTruncatedActionSchema>;

type ChatTurnsLoadedAction = z.output<typeof ChatTurnsLoadedActionSchema>;

type ChatPendingMessageSetAction = z.output<typeof ChatPendingMessageSetActionSchema>;

type ChatPendingMessageRemovedAction = z.output<typeof ChatPendingMessageRemovedActionSchema>;

type ChatQueuedMessagesReorderedAction = z.output<typeof ChatQueuedMessagesReorderedActionSchema>;

type ChatDraftChangedAction = z.output<typeof ChatDraftChangedActionSchema>;

type ChatInputRequestedAction = z.output<typeof ChatInputRequestedActionSchema>;

type ChatInputAnswerChangedAction = z.output<typeof ChatInputAnswerChangedActionSchema>;

type ChatInputCompletedAction = z.output<typeof ChatInputCompletedActionSchema>;

type ChatAction = z.output<typeof ChatActionSchema>;

export {
  ChatActionSchema,
  ChatActivityChangedActionSchema,
  ChatDeltaActionSchema,
  ChatDraftChangedActionSchema,
  ChatErrorActionSchema,
  ChatInputAnswerChangedActionSchema,
  ChatInputCompletedActionSchema,
  ChatInputRequestedActionSchema,
  ChatPendingMessageRemovedActionSchema,
  ChatPendingMessageSetActionSchema,
  ChatQueuedMessagesReorderedActionSchema,
  ChatReasoningActionSchema,
  ChatResponsePartActionSchema,
  ChatToolCallApprovedActionSchema,
  ChatToolCallAuthRequiredActionSchema,
  ChatToolCallAuthResolvedActionSchema,
  ChatToolCallCompleteActionSchema,
  ChatToolCallContentChangedActionSchema,
  ChatToolCallDeltaActionSchema,
  ChatToolCallDeniedActionSchema,
  ChatToolCallReadyActionSchema,
  ChatToolCallResultConfirmedActionSchema,
  ChatToolCallStartActionSchema,
  ChatTruncatedActionSchema,
  ChatTurnCancelledActionSchema,
  ChatTurnCompleteActionSchema,
  ChatTurnResumeActionSchema,
  ChatTurnStartedActionSchema,
  ChatTurnsLoadedActionSchema,
  ChatUsageActionSchema,
  ChatWorkingDirectoryRemovedActionSchema,
  ChatWorkingDirectorySetActionSchema,
};

export type {
  ChatAction,
  ChatActivityChangedAction,
  ChatDeltaAction,
  ChatDraftChangedAction,
  ChatErrorAction,
  ChatInputAnswerChangedAction,
  ChatInputCompletedAction,
  ChatInputRequestedAction,
  ChatPendingMessageRemovedAction,
  ChatPendingMessageSetAction,
  ChatQueuedMessagesReorderedAction,
  ChatReasoningAction,
  ChatResponsePartAction,
  ChatToolCallApprovedAction,
  ChatToolCallAuthRequiredAction,
  ChatToolCallAuthResolvedAction,
  ChatToolCallCompleteAction,
  ChatToolCallContentChangedAction,
  ChatToolCallDeltaAction,
  ChatToolCallDeniedAction,
  ChatToolCallReadyAction,
  ChatToolCallResultConfirmedAction,
  ChatToolCallStartAction,
  ChatTruncatedAction,
  ChatTurnCancelledAction,
  ChatTurnCompleteAction,
  ChatTurnResumeAction,
  ChatTurnStartedAction,
  ChatTurnsLoadedAction,
  ChatUsageAction,
  ChatWorkingDirectoryRemovedAction,
  ChatWorkingDirectorySetAction,
};
