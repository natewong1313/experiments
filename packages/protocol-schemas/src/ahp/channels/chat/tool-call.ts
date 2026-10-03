import * as z from "zod";
import { ContentRefSchema, FileEditSchema, StringOrMarkdownSchema, uriSchema } from "../../common";
import { McpAuthRequirementSchema } from "../../primitives";
import { MessageSchema } from "./message";

const ToolInputSchema = z.union([z.string(), ContentRefSchema]);

const ToolCallContributorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("client"), clientId: z.string() }),
  z.strictObject({ kind: z.literal("mcp"), customizationId: z.string() }),
]);

const toolCallBaseFields = {
  toolCallId: z.string(),
  toolName: z.string(),
  displayName: z.string(),
  intention: z.string().optional(),
  contributor: ToolCallContributorSchema.optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
};

const toolCallParameterFields = {
  invocationMessage: StringOrMarkdownSchema,
  toolInput: ToolInputSchema.optional(),
};

const ToolCallRiskAssessmentSchema = z.discriminatedUnion("status", [
  z.strictObject({ kind: z.literal("judge"), status: z.literal("loading") }),
  z.strictObject({
    kind: z.literal("judge"),
    status: z.literal("complete"),
    reason: StringOrMarkdownSchema,
    safety: z.number(),
  }),
]);

const ConfirmationOptionSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["approve", "deny"]),
  group: z.number().optional(),
});

const TerminalCommandResultSchema = z.strictObject({
  exitCode: z.number().optional(),
  preview: z.string().optional(),
  truncated: z.boolean().optional(),
});

const ToolResultContentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: z.string() }),
  z.strictObject({
    type: z.literal("embeddedResource"),
    data: z.string(),
    contentType: z.string(),
  }),
  z.strictObject({ ...ContentRefSchema.shape, type: z.literal("resource") }),
  z.strictObject({ ...FileEditSchema.shape, type: z.literal("fileEdit") }),
  z.strictObject({
    type: z.literal("terminal"),
    resource: uriSchema,
    title: z.string(),
    isPty: z.boolean().optional(),
    result: TerminalCommandResultSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("subagent"),
    resource: uriSchema,
    title: z.string(),
    agentName: z.string().optional(),
    description: z.string().optional(),
  }),
]);

const ToolCallResultSchema = z.strictObject({
  success: z.boolean(),
  pastTenseMessage: StringOrMarkdownSchema,
  content: z.array(ToolResultContentSchema).optional(),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  error: z.strictObject({ message: z.string(), code: z.string().optional() }).optional(),
});

const toolCallPostConfirmationFields = {
  confirmed: z.enum(["not-needed", "user-action", "setting"]),
  selectedOption: ConfirmationOptionSchema.optional(),
};

const ToolCallPendingConfirmationStateSchema = z.strictObject({
  ...toolCallBaseFields,
  ...toolCallParameterFields,
  status: z.literal("pending-confirmation"),
  confirmationTitle: StringOrMarkdownSchema.optional(),
  riskAssessment: ToolCallRiskAssessmentSchema.optional(),
  edits: z.strictObject({ items: z.array(FileEditSchema) }).optional(),
  editable: z.boolean().optional(),
  options: z.array(ConfirmationOptionSchema).optional(),
});

const ToolCallPendingResultConfirmationStateSchema = z.strictObject({
  ...toolCallBaseFields,
  ...toolCallParameterFields,
  ...toolCallPostConfirmationFields,
  ...ToolCallResultSchema.shape,
  status: z.literal("pending-result-confirmation"),
});

const ToolCallRunningStateSchema = z.strictObject({
  ...toolCallBaseFields,
  ...toolCallParameterFields,
  ...toolCallPostConfirmationFields,
  status: z.literal("running"),
  content: z.array(ToolResultContentSchema).optional(),
});

const ToolCallAuthRequiredStateSchema = z.strictObject({
  ...toolCallBaseFields,
  ...toolCallParameterFields,
  ...toolCallPostConfirmationFields,
  status: z.literal("auth-required"),
  contributor: z.strictObject({
    kind: z.literal("mcp"),
    customizationId: z.string(),
  }),
  auth: McpAuthRequirementSchema,
  content: z.array(ToolResultContentSchema).optional(),
});

const ToolCallStateSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...toolCallBaseFields,
    status: z.literal("streaming"),
    partialInput: z.string().optional(),
    invocationMessage: StringOrMarkdownSchema.optional(),
  }),
  ToolCallPendingConfirmationStateSchema,
  ToolCallRunningStateSchema,
  ToolCallAuthRequiredStateSchema,
  ToolCallPendingResultConfirmationStateSchema,
  z.strictObject({
    ...toolCallBaseFields,
    ...toolCallParameterFields,
    ...toolCallPostConfirmationFields,
    ...ToolCallResultSchema.shape,
    status: z.literal("completed"),
  }),
  z.strictObject({
    ...toolCallBaseFields,
    ...toolCallParameterFields,
    status: z.literal("cancelled"),
    reason: z.enum(["denied", "skipped", "result-denied"]),
    reasonMessage: StringOrMarkdownSchema.optional(),
    userSuggestion: MessageSchema.optional(),
    selectedOption: ConfirmationOptionSchema.optional(),
  }),
]);

type ToolInput = z.output<typeof ToolInputSchema>;

type ToolCallContributor = z.output<typeof ToolCallContributorSchema>;

type ToolCallRiskAssessment = z.output<typeof ToolCallRiskAssessmentSchema>;

type ConfirmationOption = z.output<typeof ConfirmationOptionSchema>;

type ToolResultContent = z.output<typeof ToolResultContentSchema>;

type ToolCallResult = z.output<typeof ToolCallResultSchema>;

type ToolCallState = z.output<typeof ToolCallStateSchema>;

type ToolCallRunningState = z.output<typeof ToolCallRunningStateSchema>;

type ToolCallAuthRequiredState = z.output<typeof ToolCallAuthRequiredStateSchema>;

type ToolCallPendingConfirmationState = z.output<typeof ToolCallPendingConfirmationStateSchema>;

type ToolCallPendingResultConfirmationState = z.output<
  typeof ToolCallPendingResultConfirmationStateSchema
>;

type TerminalCommandResult = z.output<typeof TerminalCommandResultSchema>;

export {
  ConfirmationOptionSchema,
  TerminalCommandResultSchema,
  ToolCallAuthRequiredStateSchema,
  ToolCallContributorSchema,
  ToolCallPendingConfirmationStateSchema,
  ToolCallPendingResultConfirmationStateSchema,
  ToolCallResultSchema,
  ToolCallRiskAssessmentSchema,
  ToolCallRunningStateSchema,
  ToolCallStateSchema,
  ToolInputSchema,
  ToolResultContentSchema,
  type ConfirmationOption,
  type ToolCallAuthRequiredState,
  type ToolCallContributor,
  type ToolCallPendingConfirmationState,
  type ToolCallPendingResultConfirmationState,
  type ToolCallResult,
  type ToolCallRiskAssessment,
  type ToolCallRunningState,
  type ToolCallState,
  type ToolInput,
  type ToolResultContent,
  type TerminalCommandResult,
};
