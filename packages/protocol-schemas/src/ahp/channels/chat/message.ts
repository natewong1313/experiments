import * as z from "zod";
import {
  ContentRefSchema,
  TextRangeSchema,
  TextSelectionSchema,
  metaSchema,
  uriSchema,
} from "../../common";
import { AgentSelectionSchema, ModelSelectionSchema } from "../../primitives";

const MessageOriginSchema = z.strictObject({
  kind: z.enum(["user", "agent", "tool", "automation", "systemNotification"]),
});

const messageAttachmentBaseFields = {
  label: z.string(),
  range: TextRangeSchema.optional(),
  displayKind: z.string().optional(),
  _meta: metaSchema.optional(),
};

const SimpleMessageAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("simple"),
  modelRepresentation: z.string().optional(),
});

const MessageEmbeddedResourceAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("embeddedResource"),
  data: z.string(),
  contentType: z.string(),
  selection: TextSelectionSchema.optional(),
});

const MessageResourceAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  ...ContentRefSchema.shape,
  type: z.literal("resource"),
  selection: TextSelectionSchema.optional(),
});

const MessageAnnotationsAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("annotations"),
  resource: uriSchema,
  annotationIds: z.array(z.string()).optional(),
});

const MessageChatAttachmentSchema = z.strictObject({
  ...messageAttachmentBaseFields,
  type: z.literal("chat"),
  resource: uriSchema,
  endTurn: z.string().optional(),
});

const MessageAttachmentSchema = z.discriminatedUnion("type", [
  SimpleMessageAttachmentSchema,
  MessageEmbeddedResourceAttachmentSchema,
  MessageResourceAttachmentSchema,
  MessageAnnotationsAttachmentSchema,
  MessageChatAttachmentSchema,
]);

const MessageSchema = z.strictObject({
  text: z.string(),
  origin: MessageOriginSchema,
  attachments: z.array(MessageAttachmentSchema).optional(),
  model: ModelSelectionSchema.optional(),
  agent: AgentSelectionSchema.optional(),
  _meta: metaSchema.optional(),
});

type MessageOrigin = z.output<typeof MessageOriginSchema>;
type SimpleMessageAttachment = z.output<typeof SimpleMessageAttachmentSchema>;
type MessageEmbeddedResourceAttachment = z.output<typeof MessageEmbeddedResourceAttachmentSchema>;
type MessageResourceAttachment = z.output<typeof MessageResourceAttachmentSchema>;
type MessageAnnotationsAttachment = z.output<typeof MessageAnnotationsAttachmentSchema>;
type MessageChatAttachment = z.output<typeof MessageChatAttachmentSchema>;
type MessageAttachment = z.output<typeof MessageAttachmentSchema>;
type Message = z.output<typeof MessageSchema>;

export {
  MessageAttachmentSchema,
  MessageChatAttachmentSchema,
  MessageEmbeddedResourceAttachmentSchema,
  MessageOriginSchema,
  MessageResourceAttachmentSchema,
  MessageSchema,
  MessageAnnotationsAttachmentSchema,
  SimpleMessageAttachmentSchema,
  type Message,
  type MessageAnnotationsAttachment,
  type MessageAttachment,
  type MessageChatAttachment,
  type MessageEmbeddedResourceAttachment,
  type MessageOrigin,
  type MessageResourceAttachment,
  type SimpleMessageAttachment,
};
