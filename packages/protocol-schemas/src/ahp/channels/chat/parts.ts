import * as z from "zod";
import {
  ContentRefSchema,
  ErrorInfoSchema,
  StringOrMarkdownSchema,
  metaSchema,
} from "../../common";
import { ChatInputRequestSchema, ChatInputResponseKindSchema } from "./input";
import { ToolCallStateSchema } from "./tool-call";

const MarkdownResponsePartSchema = z.strictObject({
  kind: z.literal("markdown"),
  id: z.string(),
  content: z.string(),
});

const ResourceResponsePartSchema = z.strictObject({
  ...ContentRefSchema.shape,
  kind: z.literal("contentRef"),
});

const ToolCallResponsePartSchema = z.strictObject({
  kind: z.literal("toolCall"),
  toolCall: ToolCallStateSchema,
});

const ReasoningResponsePartSchema = z.strictObject({
  kind: z.literal("reasoning"),
  id: z.string(),
  content: z.string(),
});

const SystemNotificationResponsePartSchema = z.strictObject({
  kind: z.literal("systemNotification"),
  content: StringOrMarkdownSchema,
  _meta: metaSchema.optional(),
});

const InputRequestResponsePartSchema = z.strictObject({
  kind: z.literal("inputRequest"),
  request: ChatInputRequestSchema,
  response: ChatInputResponseKindSchema.optional(),
});

const ErrorResponsePartSchema = z.strictObject({
  kind: z.literal("error"),
  error: ErrorInfoSchema,
  resumable: z.boolean().optional(),
});

const ResponsePartSchema = z.discriminatedUnion("kind", [
  MarkdownResponsePartSchema,
  ResourceResponsePartSchema,
  ToolCallResponsePartSchema,
  ReasoningResponsePartSchema,
  SystemNotificationResponsePartSchema,
  InputRequestResponsePartSchema,
  ErrorResponsePartSchema,
]);

type MarkdownResponsePart = z.output<typeof MarkdownResponsePartSchema>;
type ResourceResponsePart = z.output<typeof ResourceResponsePartSchema>;
type ToolCallResponsePart = z.output<typeof ToolCallResponsePartSchema>;
type ReasoningResponsePart = z.output<typeof ReasoningResponsePartSchema>;
type SystemNotificationResponsePart = z.output<typeof SystemNotificationResponsePartSchema>;
type InputRequestResponsePart = z.output<typeof InputRequestResponsePartSchema>;
type ErrorResponsePart = z.output<typeof ErrorResponsePartSchema>;
type ResponsePart = z.output<typeof ResponsePartSchema>;

export {
  ErrorResponsePartSchema,
  InputRequestResponsePartSchema,
  MarkdownResponsePartSchema,
  ReasoningResponsePartSchema,
  ResourceResponsePartSchema,
  ResponsePartSchema,
  SystemNotificationResponsePartSchema,
  ToolCallResponsePartSchema,
  type ErrorResponsePart,
  type InputRequestResponsePart,
  type MarkdownResponsePart,
  type ReasoningResponsePart,
  type ResourceResponsePart,
  type ResponsePart,
  type SystemNotificationResponsePart,
  type ToolCallResponsePart,
};
