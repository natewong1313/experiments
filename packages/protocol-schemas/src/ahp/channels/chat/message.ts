import * as z from "zod";
import {
  ContentRefSchema,
  TextRangeSchema,
  TextSelectionSchema,
  metaSchema,
  uriSchema,
} from "../../common";
import { AgentSelectionSchema, ModelSelectionSchema } from "../../primitives";

export const MessageOriginSchema = z.strictObject({
  kind: z.enum(["user", "agent", "tool", "automation", "systemNotification"]),
});

const messageAttachmentBaseFields = {
  label: z.string(),
  range: TextRangeSchema.optional(),
  displayKind: z.string().optional(),
  _meta: metaSchema.optional(),
};

export const SimpleMessageAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("simple"),
  modelRepresentation: z.string().optional(),
});

export const MessageEmbeddedResourceAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("embeddedResource"),
  data: z.string(),
  contentType: z.string(),
  selection: TextSelectionSchema.optional(),
});

export const MessageResourceAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  ...ContentRefSchema.shape,
  type: z.literal("resource"),
  selection: TextSelectionSchema.optional(),
});

export const MessageAnnotationsAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("annotations"),
  resource: uriSchema,
  annotationIds: z.array(z.string()).optional(),
});

export const MessageChatAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("chat"),
  resource: uriSchema,
  endTurn: z.string().optional(),
});

export const MessageAttachmentSchema = z.discriminatedUnion("type", [
  SimpleMessageAttachmentSchema,
  MessageEmbeddedResourceAttachmentSchema,
  MessageResourceAttachmentSchema,
  MessageAnnotationsAttachmentSchema,
  MessageChatAttachmentSchema,
]);

export const MessageSchema = z.strictObject({
  text: z.string(),
  origin: MessageOriginSchema,
  attachments: z.array(MessageAttachmentSchema).optional(),
  model: ModelSelectionSchema.optional(),
  agent: AgentSelectionSchema.optional(),
  _meta: metaSchema.optional(),
});

export type MessageOrigin = z.output<typeof MessageOriginSchema>;

export type SimpleMessageAttachment = z.output<typeof SimpleMessageAttachmentSchema>;

export type MessageEmbeddedResourceAttachment = z.output<
  typeof MessageEmbeddedResourceAttachmentSchema
>;

export type MessageResourceAttachment = z.output<typeof MessageResourceAttachmentSchema>;

export type MessageAnnotationsAttachment = z.output<typeof MessageAnnotationsAttachmentSchema>;

export type MessageChatAttachment = z.output<typeof MessageChatAttachmentSchema>;

export type MessageAttachment = z.output<typeof MessageAttachmentSchema>;

export type Message = z.output<typeof MessageSchema>;
