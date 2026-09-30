import * as z from "zod";
import {
  FileEditSchema,
  StringOrMarkdownSchema,
  UsageInfoSchema,
  metaSchema,
  uriSchema,
} from "../../common";
import { McpAuthRequirementSchema } from "../../primitives";
import { ChatInputAnswerSchema, ChatInputRequestSchema, ChatInputResponseKindSchema } from "./input";
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

const ChatActionSchema = z.union([
  z.strictObject({
    type: z.literal("chat/turnStarted"),
    turnId: z.string(),
    startedAt: z.string(),
    message: MessageSchema,
    queuedMessageId: z.string().optional(),
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/delta"),
    turnId: z.string(),
    partId: z.string(),
    content: z.string(),
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/responsePart"),
    turnId: z.string(),
    part: ResponsePartSchema,
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallStart"),
    toolName: z.string(),
    displayName: z.string(),
    intention: z.string().optional(),
    contributor: ToolCallContributorSchema.optional(),
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallDelta"),
    content: z.string().optional(),
    invocationMessage: StringOrMarkdownSchema.optional(),
  }),
  z.strictObject({
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
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallConfirmed"),
    approved: z.literal(true),
    confirmed: z.enum(["not-needed", "user-action", "setting"]),
    editedToolInput: z.string().optional(),
    selectedOptionId: z.string().optional(),
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallConfirmed"),
    approved: z.literal(false),
    reason: z.enum(["denied", "skipped"]),
    userSuggestion: MessageSchema.optional(),
    reasonMessage: StringOrMarkdownSchema.optional(),
    selectedOptionId: z.string().optional(),
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallComplete"),
    result: ToolCallResultSchema,
    requiresResultConfirmation: z.boolean().optional(),
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallResultConfirmed"),
    approved: z.boolean(),
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallContentChanged"),
    content: z.array(ToolResultContentSchema),
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallAuthRequired"),
    auth: McpAuthRequirementSchema,
  }),
  z.strictObject({
    ...toolCallActionBaseFields,
    type: z.literal("chat/toolCallAuthResolved"),
  }),
  z.strictObject({
    type: z.literal("chat/turnComplete"),
    turnId: z.string(),
    duration: z.number(),
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/turnCancelled"),
    turnId: z.string(),
    duration: z.number(),
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/error"),
    turnId: z.string(),
    duration: z.number(),
    part: ErrorResponsePartSchema,
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/turnResume"),
    turnId: z.string(),
  }),
  z.strictObject({
    type: z.literal("chat/activityChanged"),
    activity: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("chat/workingDirectorySet"),
    directory: uriSchema,
  }),
  z.strictObject({
    type: z.literal("chat/workingDirectoryRemoved"),
    directory: uriSchema,
  }),
  z.strictObject({
    type: z.literal("chat/usage"),
    turnId: z.string(),
    usage: UsageInfoSchema,
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/reasoning"),
    turnId: z.string(),
    partId: z.string(),
    content: z.string(),
    _meta: metaSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/truncated"),
    turnId: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("chat/turnsLoaded"),
    turns: z.array(TurnSchema),
    turnsNextCursor: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("chat/pendingMessageSet"),
    kind: z.enum(["steering", "queued"]),
    id: z.string(),
    message: MessageSchema,
  }),
  z.strictObject({
    type: z.literal("chat/pendingMessageRemoved"),
    kind: z.enum(["steering", "queued"]),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("chat/queuedMessagesReordered"),
    order: z.array(z.string()),
  }),
  z.strictObject({
    type: z.literal("chat/draftChanged"),
    draft: MessageSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/inputRequested"),
    request: ChatInputRequestSchema,
  }),
  z.strictObject({
    type: z.literal("chat/inputAnswerChanged"),
    requestId: z.string(),
    questionId: z.string(),
    answer: ChatInputAnswerSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("chat/inputCompleted"),
    requestId: z.string(),
    response: ChatInputResponseKindSchema,
    answers: z.record(z.string(), ChatInputAnswerSchema).optional(),
  }),
]);

type ChatAction = z.output<typeof ChatActionSchema>;

export {
  ChatActionSchema,
  type ChatAction,
};
