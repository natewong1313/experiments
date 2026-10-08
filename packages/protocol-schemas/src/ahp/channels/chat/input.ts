import * as z from "zod";
import { uriSchema } from "../../common";

export const ChatInputOptionSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  recommended: z.boolean().optional(),
});

export const ChatInputQuestionSchema = z.discriminatedUnion("kind", [
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

export const ChatInputAnswerValueSchema = z.discriminatedUnion("kind", [
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

export const ChatInputAnswerSchema = z.union([
  z.strictObject({
    state: z.enum(["draft", "submitted"]),
    value: ChatInputAnswerValueSchema,
  }),
  z.strictObject({
    state: z.literal("skipped"),
    freeformValues: z.array(z.string()).optional(),
  }),
]);

export const ChatInputRequestSchema = z.strictObject({
  id: z.string(),
  message: z.string().optional(),
  url: uriSchema.optional(),
  questions: z.array(ChatInputQuestionSchema).optional(),
  answers: z.record(z.string(), ChatInputAnswerSchema).optional(),
});

export const ChatInputResponseKindSchema = z.enum(["accept", "decline", "cancel"]);

export type ChatInputOption = z.output<typeof ChatInputOptionSchema>;

export type ChatInputQuestion = z.output<typeof ChatInputQuestionSchema>;

export type ChatInputAnswerValue = z.output<typeof ChatInputAnswerValueSchema>;

export type ChatInputAnswer = z.output<typeof ChatInputAnswerSchema>;

export type ChatInputRequest = z.output<typeof ChatInputRequestSchema>;

export type ChatInputResponseKind = z.output<typeof ChatInputResponseKindSchema>;
