import * as z from "zod";
import { SessionIdSchema, TextContentSchema } from "./session";

const PromptTextContentSchema = TextContentSchema.strict();

const PromptRequestSchema = z.strictObject({
  sessionId: SessionIdSchema,
  prompt: z.array(PromptTextContentSchema),
});

const StopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);

const PromptResponseSchema = z.looseObject({
  stopReason: StopReasonSchema,
});

const CancelNotificationSchema = z.strictObject({
  sessionId: SessionIdSchema,
});

type PromptTextContent = z.output<typeof PromptTextContentSchema>;

type PromptRequest = z.output<typeof PromptRequestSchema>;

type PromptResponse = z.output<typeof PromptResponseSchema>;

type StopReason = z.output<typeof StopReasonSchema>;

type CancelNotification = z.output<typeof CancelNotificationSchema>;

export {
  CancelNotificationSchema,
  PromptRequestSchema,
  PromptResponseSchema,
  PromptTextContentSchema,
  StopReasonSchema,
  type CancelNotification,
  type PromptRequest,
  type PromptResponse,
  type PromptTextContent,
  type StopReason,
};
