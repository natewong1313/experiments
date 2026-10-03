// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";

const RequestIdSchema = z.union([
  z.null(),
  z.number().refine(Number.isInteger, { message: "Expected integer" }),
  z.string(),
]);
const RequestIdOutboundSchema = z.union([
  z.null(),
  z.number().refine(Number.isInteger, { message: "Expected integer" }),
  z.string(),
]);
type RequestId = z.output<typeof RequestIdSchema>;
const SessionIdSchema = z.string();
const SessionIdOutboundSchema = z.string();
type SessionId = z.output<typeof SessionIdSchema>;
const WriteTextFileRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  path: z.string(),
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const WriteTextFileRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  path: z.string(),
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type WriteTextFileRequest = z.output<typeof WriteTextFileRequestSchema>;
const ReadTextFileRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  limit: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ReadTextFileRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  limit: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ReadTextFileRequest = z.output<typeof ReadTextFileRequestSchema>;
const ToolCallIdSchema = z.string();
const ToolCallIdOutboundSchema = z.string();
type ToolCallId = z.output<typeof ToolCallIdSchema>;
const ToolKindSchema = z.union([
  z.literal("read"),
  z.literal("edit"),
  z.literal("delete"),
  z.literal("move"),
  z.literal("search"),
  z.literal("execute"),
  z.literal("think"),
  z.literal("fetch"),
  z.literal("switch_mode"),
  z.literal("other"),
]);
const ToolKindOutboundSchema = z.union([
  z.literal("read"),
  z.literal("edit"),
  z.literal("delete"),
  z.literal("move"),
  z.literal("search"),
  z.literal("execute"),
  z.literal("think"),
  z.literal("fetch"),
  z.literal("switch_mode"),
  z.literal("other"),
]);
type ToolKind = z.output<typeof ToolKindSchema>;
const ToolCallStatusSchema = z.union([
  z.literal("pending"),
  z.literal("in_progress"),
  z.literal("completed"),
  z.literal("failed"),
]);
const ToolCallStatusOutboundSchema = z.union([
  z.literal("pending"),
  z.literal("in_progress"),
  z.literal("completed"),
  z.literal("failed"),
]);
type ToolCallStatus = z.output<typeof ToolCallStatusSchema>;
const RoleSchema = z.union([z.literal("assistant"), z.literal("user")]);
const RoleOutboundSchema = z.union([z.literal("assistant"), z.literal("user")]);
type Role = z.output<typeof RoleSchema>;
const AnnotationsSchema = z.looseObject({
  audience: z.union([z.array(RoleSchema), z.null()]).optional(),
  lastModified: z.union([z.string(), z.null()]).optional(),
  priority: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AnnotationsOutboundSchema = z.strictObject({
  audience: z.union([z.array(RoleOutboundSchema), z.null()]).optional(),
  lastModified: z.union([z.string(), z.null()]).optional(),
  priority: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type Annotations = z.output<typeof AnnotationsSchema>;
const TextContentSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TextContentOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type TextContent = z.output<typeof TextContentSchema>;
const ImageContentSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  uri: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ImageContentOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  uri: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ImageContent = z.output<typeof ImageContentSchema>;
const AudioContentSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const AudioContentOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type AudioContent = z.output<typeof AudioContentSchema>;
const ResourceLinkSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  name: z.string(),
  size: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  title: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ResourceLinkOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  name: z.string(),
  size: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  title: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ResourceLink = z.output<typeof ResourceLinkSchema>;
const TextResourceContentsSchema = z.looseObject({
  mimeType: z.union([z.string(), z.null()]).optional(),
  text: z.string(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TextResourceContentsOutboundSchema = z.strictObject({
  mimeType: z.union([z.string(), z.null()]).optional(),
  text: z.string(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type TextResourceContents = z.output<typeof TextResourceContentsSchema>;
const BlobResourceContentsSchema = z.looseObject({
  blob: z.string(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const BlobResourceContentsOutboundSchema = z.strictObject({
  blob: z.string(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type BlobResourceContents = z.output<typeof BlobResourceContentsSchema>;
const EmbeddedResourceResourceSchema = z.union([
  TextResourceContentsSchema,
  BlobResourceContentsSchema,
]);
const EmbeddedResourceResourceOutboundSchema = z.union([
  TextResourceContentsOutboundSchema,
  BlobResourceContentsOutboundSchema,
]);
type EmbeddedResourceResource = z.output<typeof EmbeddedResourceResourceSchema>;
const EmbeddedResourceSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  resource: EmbeddedResourceResourceSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const EmbeddedResourceOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  resource: EmbeddedResourceResourceOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type EmbeddedResource = z.output<typeof EmbeddedResourceSchema>;
const ContentBlockSchema = z.union([
  z.looseObject({
    annotations: z.union([AnnotationsSchema, z.null()]).optional(),
    text: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("text"),
  }),
  z.looseObject({
    annotations: z.union([AnnotationsSchema, z.null()]).optional(),
    data: z.string(),
    mimeType: z.string(),
    uri: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("image"),
  }),
  z.looseObject({
    annotations: z.union([AnnotationsSchema, z.null()]).optional(),
    data: z.string(),
    mimeType: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("audio"),
  }),
  z.looseObject({
    annotations: z.union([AnnotationsSchema, z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    mimeType: z.union([z.string(), z.null()]).optional(),
    name: z.string(),
    size: z
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
      .optional(),
    title: z.union([z.string(), z.null()]).optional(),
    uri: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("resource_link"),
  }),
  z.looseObject({
    annotations: z.union([AnnotationsSchema, z.null()]).optional(),
    resource: EmbeddedResourceResourceSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("resource"),
  }),
]);
const ContentBlockOutboundSchema = z.union([
  z.strictObject({
    annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
    text: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("text"),
  }),
  z.strictObject({
    annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
    data: z.string(),
    mimeType: z.string(),
    uri: z.union([z.string(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("image"),
  }),
  z.strictObject({
    annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
    data: z.string(),
    mimeType: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("audio"),
  }),
  z.strictObject({
    annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    mimeType: z.union([z.string(), z.null()]).optional(),
    name: z.string(),
    size: z
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
      .optional(),
    title: z.union([z.string(), z.null()]).optional(),
    uri: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("resource_link"),
  }),
  z.strictObject({
    annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
    resource: EmbeddedResourceResourceOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("resource"),
  }),
]);
type ContentBlock = z.output<typeof ContentBlockSchema>;
const ContentSchema = z.looseObject({
  content: ContentBlockSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ContentOutboundSchema = z.strictObject({
  content: ContentBlockOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type Content = z.output<typeof ContentSchema>;
const DiffSchema = z.looseObject({
  path: z.string(),
  oldText: z.union([z.string(), z.null()]).optional(),
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DiffOutboundSchema = z.strictObject({
  path: z.string(),
  oldText: z.union([z.string(), z.null()]).optional(),
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type Diff = z.output<typeof DiffSchema>;
export {
  RequestIdSchema,
  RequestIdOutboundSchema,
  type RequestId,
  SessionIdSchema,
  SessionIdOutboundSchema,
  type SessionId,
  WriteTextFileRequestSchema,
  WriteTextFileRequestOutboundSchema,
  type WriteTextFileRequest,
  ReadTextFileRequestSchema,
  ReadTextFileRequestOutboundSchema,
  type ReadTextFileRequest,
  ToolCallIdSchema,
  ToolCallIdOutboundSchema,
  type ToolCallId,
  ToolKindSchema,
  ToolKindOutboundSchema,
  type ToolKind,
  ToolCallStatusSchema,
  ToolCallStatusOutboundSchema,
  type ToolCallStatus,
  RoleSchema,
  RoleOutboundSchema,
  type Role,
  AnnotationsSchema,
  AnnotationsOutboundSchema,
  type Annotations,
  TextContentSchema,
  TextContentOutboundSchema,
  type TextContent,
  ImageContentSchema,
  ImageContentOutboundSchema,
  type ImageContent,
  AudioContentSchema,
  AudioContentOutboundSchema,
  type AudioContent,
  ResourceLinkSchema,
  ResourceLinkOutboundSchema,
  type ResourceLink,
  TextResourceContentsSchema,
  TextResourceContentsOutboundSchema,
  type TextResourceContents,
  BlobResourceContentsSchema,
  BlobResourceContentsOutboundSchema,
  type BlobResourceContents,
  EmbeddedResourceResourceSchema,
  EmbeddedResourceResourceOutboundSchema,
  type EmbeddedResourceResource,
  EmbeddedResourceSchema,
  EmbeddedResourceOutboundSchema,
  type EmbeddedResource,
  ContentBlockSchema,
  ContentBlockOutboundSchema,
  type ContentBlock,
  ContentSchema,
  ContentOutboundSchema,
  type Content,
  DiffSchema,
  DiffOutboundSchema,
  type Diff,
};
