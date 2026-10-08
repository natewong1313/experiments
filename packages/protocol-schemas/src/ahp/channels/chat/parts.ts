import * as z from "zod";
import {
  ContentRefSchema,
  ErrorInfoSchema,
  StringOrMarkdownSchema,
  metaSchema,
} from "../../common";
import { ChatInputRequestSchema, ChatInputResponseKindSchema } from "./input";
import { ToolCallStateSchema } from "./tool-call";

export const MarkdownResponsePartSchema = z.strictObject({
  kind: z.literal("markdown"),
  id: z.string(),
  content: z.string(),
});

export const ResourceResponsePartSchema = z.strictObject({
  ...ContentRefSchema.shape,
  kind: z.literal("contentRef"),
});

export const ToolCallResponsePartSchema = z.strictObject({
  kind: z.literal("toolCall"),
  toolCall: ToolCallStateSchema,
});

export const ReasoningResponsePartSchema = z.strictObject({
  kind: z.literal("reasoning"),
  id: z.string(),
  content: z.string(),
});

export const SystemNotificationResponsePartSchema = z.strictObject({
  kind: z.literal("systemNotification"),
  content: StringOrMarkdownSchema,
  _meta: metaSchema.optional(),
});

export const InputRequestResponsePartSchema = z.strictObject({
  kind: z.literal("inputRequest"),
  request: ChatInputRequestSchema,
  response: ChatInputResponseKindSchema.optional(),
});

export const ErrorResponsePartSchema = z.strictObject({
  kind: z.literal("error"),
  error: ErrorInfoSchema,
  resumable: z.boolean().optional(),
});

export const ResponsePartSchema = z.discriminatedUnion("kind", [
  MarkdownResponsePartSchema,
  ResourceResponsePartSchema,
  ToolCallResponsePartSchema,
  ReasoningResponsePartSchema,
  SystemNotificationResponsePartSchema,
  InputRequestResponsePartSchema,
  ErrorResponsePartSchema,
]);

export type MarkdownResponsePart = z.output<typeof MarkdownResponsePartSchema>;

export type ResourceResponsePart = z.output<typeof ResourceResponsePartSchema>;

export type ToolCallResponsePart = z.output<typeof ToolCallResponsePartSchema>;

export type ReasoningResponsePart = z.output<typeof ReasoningResponsePartSchema>;

export type SystemNotificationResponsePart = z.output<typeof SystemNotificationResponsePartSchema>;

export type InputRequestResponsePart = z.output<typeof InputRequestResponsePartSchema>;

export type ErrorResponsePart = z.output<typeof ErrorResponsePartSchema>;

export type ResponsePart = z.output<typeof ResponsePartSchema>;
