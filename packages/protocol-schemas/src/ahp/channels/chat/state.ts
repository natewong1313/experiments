import * as z from "zod";
import { UsageInfoSchema, isoTimestampSchema, uriSchema } from "../../common";
import { sessionStatusSchema } from "../../primitives";
import { MessageSchema } from "./message";
import { ResponsePartSchema } from "./parts";

export const PendingMessageSchema = z.strictObject({
  id: z.string(),
  message: MessageSchema,
});

export const SideChatSelectionSchema = z.strictObject({
  text: z.string(),
  responsePartId: z.string().optional(),
});

export const ChatOriginSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({
    kind: z.literal("fork"),
    chat: uriSchema,
    turnId: z.string(),
  }),
  z.strictObject({
    kind: z.literal("sideChat"),
    chat: uriSchema,
    turnId: z.string(),
    selection: SideChatSelectionSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("tool"),
    chat: uriSchema,
    toolCallId: z.string(),
  }),
]);

export const chatInteractivitySchema = z.enum(["full", "read-only", "hidden"]);

const chatSummaryFields = {
  resource: uriSchema,
  title: z.string(),
  status: sessionStatusSchema,
  activity: z.string().optional(),
  modifiedAt: isoTimestampSchema,
  origin: ChatOriginSchema.optional(),
  interactivity: chatInteractivitySchema.optional(),
  workingDirectories: z.array(uriSchema).optional(),
};

export const ChatSummarySchema = z.strictObject(chatSummaryFields);

export const TurnSchema = z.strictObject({
  id: z.string(),
  startedAt: isoTimestampSchema.optional(),
  duration: z.number().optional(),
  message: MessageSchema,
  responseParts: z.array(ResponsePartSchema),
  usage: UsageInfoSchema.optional(),
  state: z.enum(["complete", "cancelled", "error"]),
});

export const ActiveTurnSchema = z.strictObject({
  id: z.string(),
  startedAt: isoTimestampSchema,
  message: MessageSchema,
  responseParts: z.array(ResponsePartSchema),
  usage: UsageInfoSchema.optional(),
});

export const ChatStateSchema = z.strictObject({
  ...chatSummaryFields,
  turns: z.array(TurnSchema),
  turnsNextCursor: z.string().optional(),
  activeTurn: ActiveTurnSchema.optional(),
  steeringMessage: PendingMessageSchema.optional(),
  queuedMessages: z.array(PendingMessageSchema).optional(),
  draft: MessageSchema.optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export type ChatOrigin = z.output<typeof ChatOriginSchema>;

export type ChatInteractivity = z.output<typeof chatInteractivitySchema>;

export type SideChatSelection = z.output<typeof SideChatSelectionSchema>;

export type ChatSummary = z.output<typeof ChatSummarySchema>;

export type Turn = z.output<typeof TurnSchema>;

export type ActiveTurn = z.output<typeof ActiveTurnSchema>;

export type PendingMessage = z.output<typeof PendingMessageSchema>;

export type ChatState = z.output<typeof ChatStateSchema>;
