import * as z from "zod";
import { uriSchema } from "../../common";

const ChatInputOptionSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  recommended: z.boolean().optional(),
});

const ChatInputQuestionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("text"),
    id: z.string(),
    title: z.string().optional(),
    message: z.string(),
    required: z.boolean().optional(),
    format: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    defaultValue: z.string().optional(),
  }),
  z.strictObject({
    kind: z.enum(["number", "integer"]),
    id: z.string(),
    title: z.string().optional(),
    message: z.string(),
    required: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    defaultValue: z.number().optional(),
  }),
  z.strictObject({
    kind: z.literal("boolean"),
    id: z.string(),
    title: z.string().optional(),
    message: z.string(),
    required: z.boolean().optional(),
    defaultValue: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal("single-select"),
    id: z.string(),
    title: z.string().optional(),
    message: z.string(),
    required: z.boolean().optional(),
    options: z.array(ChatInputOptionSchema),
    allowFreeformInput: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal("multi-select"),
    id: z.string(),
    title: z.string().optional(),
    message: z.string(),
    required: z.boolean().optional(),
    options: z.array(ChatInputOptionSchema),
    allowFreeformInput: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
]);

const ChatInputAnswerValueSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), value: z.string() }),
  z.strictObject({ kind: z.literal("number"), value: z.number() }),
  z.strictObject({ kind: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({
    kind: z.literal("selected"),
    value: z.string(),
    freeformValues: z.array(z.string()).optional(),
  }),
  z.strictObject({
    kind: z.literal("selected-many"),
    value: z.array(z.string()),
    freeformValues: z.array(z.string()).optional(),
  }),
]);

const ChatInputAnswerSchema = z.union([
  z.strictObject({
    state: z.enum(["draft", "submitted"]),
    value: ChatInputAnswerValueSchema,
  }),
  z.strictObject({
    state: z.literal("skipped"),
    freeformValues: z.array(z.string()).optional(),
  }),
]);

const ChatInputRequestSchema = z.strictObject({
  id: z.string(),
  message: z.string().optional(),
  url: uriSchema.optional(),
  questions: z.array(ChatInputQuestionSchema).optional(),
  answers: z.record(z.string(), ChatInputAnswerSchema).optional(),
});

const ChatInputResponseKindSchema = z.enum(["accept", "decline", "cancel"]);

type ChatInputOption = z.output<typeof ChatInputOptionSchema>;
type ChatInputQuestion = z.output<typeof ChatInputQuestionSchema>;
type ChatInputAnswerValue = z.output<typeof ChatInputAnswerValueSchema>;
type ChatInputAnswer = z.output<typeof ChatInputAnswerSchema>;
type ChatInputRequest = z.output<typeof ChatInputRequestSchema>;
type ChatInputResponseKind = z.output<typeof ChatInputResponseKindSchema>;

export {
  ChatInputAnswerSchema,
  ChatInputAnswerValueSchema,
  ChatInputOptionSchema,
  ChatInputQuestionSchema,
  ChatInputRequestSchema,
  ChatInputResponseKindSchema,
  type ChatInputAnswer,
  type ChatInputAnswerValue,
  type ChatInputOption,
  type ChatInputQuestion,
  type ChatInputRequest,
  type ChatInputResponseKind,
};
