import * as z from "zod";
import { UsageInfoSchema, isoTimestampSchema, uriSchema } from "../../common";
import { sessionStatusSchema } from "../../primitives";
import { MessageSchema } from "./message";
import { ResponsePartSchema } from "./parts";

const PendingMessageSchema = z.strictObject({
  id: z.string(),
  message: MessageSchema,
});

const SideChatSelectionSchema = z.strictObject({
  text: z.string(),
  responsePartId: z.string().optional(),
});

const ChatOriginSchema = z.discriminatedUnion("kind", [
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

const chatInteractivitySchema = z.enum(["full", "read-only", "hidden"]);

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

const ChatSummarySchema = z.strictObject(chatSummaryFields);

const TurnSchema = z.strictObject({
  id: z.string(),
  startedAt: isoTimestampSchema.optional(),
  duration: z.number().optional(),
  message: MessageSchema,
  responseParts: z.array(ResponsePartSchema),
  usage: UsageInfoSchema.optional(),
  state: z.enum(["complete", "cancelled", "error"]),
});

const ActiveTurnSchema = z.strictObject({
  id: z.string(),
  startedAt: isoTimestampSchema,
  message: MessageSchema,
  responseParts: z.array(ResponsePartSchema),
  usage: UsageInfoSchema.optional(),
});

const ChatStateSchema = z.strictObject({
  ...chatSummaryFields,
  turns: z.array(TurnSchema),
  turnsNextCursor: z.string().optional(),
  activeTurn: ActiveTurnSchema.optional(),
  steeringMessage: PendingMessageSchema.optional(),
  queuedMessages: z.array(PendingMessageSchema).optional(),
  draft: MessageSchema.optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

type ChatOrigin = z.output<typeof ChatOriginSchema>;
type ChatInteractivity = z.output<typeof chatInteractivitySchema>;
type SideChatSelection = z.output<typeof SideChatSelectionSchema>;
type ChatSummary = z.output<typeof ChatSummarySchema>;
type Turn = z.output<typeof TurnSchema>;
type ActiveTurn = z.output<typeof ActiveTurnSchema>;
type PendingMessage = z.output<typeof PendingMessageSchema>;
type ChatState = z.output<typeof ChatStateSchema>;

export {
  ActiveTurnSchema,
  ChatOriginSchema,
  ChatStateSchema,
  ChatSummarySchema,
  chatInteractivitySchema,
  PendingMessageSchema,
  SideChatSelectionSchema,
  TurnSchema,
  type ActiveTurn,
  type ChatInteractivity,
  type ChatOrigin,
  type ChatState,
  type ChatSummary,
  type PendingMessage,
  type SideChatSelection,
  type Turn,
};
