// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";

export const RequestIdSchema = z.union([
  z.null(),
  z.number().refine(Number.isInteger, { error: "Expected integer" }),
  z.string(),
]);

export const RequestIdOutboundSchema = z.union([
  z.null(),
  z.number().refine(Number.isInteger, { error: "Expected integer" }),
  z.string(),
]);

export type RequestId = z.output<typeof RequestIdSchema>;

export const SessionIdSchema = z.string();

export const SessionIdOutboundSchema = z.string();

export type SessionId = z.output<typeof SessionIdSchema>;

export const WriteTextFileRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  path: z.string(),
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const WriteTextFileRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  path: z.string(),
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type WriteTextFileRequest = z.output<typeof WriteTextFileRequestSchema>;

export const ReadTextFileRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  limit: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ReadTextFileRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  limit: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ReadTextFileRequest = z.output<typeof ReadTextFileRequestSchema>;

export const ToolCallIdSchema = z.string();

export const ToolCallIdOutboundSchema = z.string();

export type ToolCallId = z.output<typeof ToolCallIdSchema>;

export const ToolKindSchema = z.enum([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);

export const ToolKindOutboundSchema = z.enum([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);

export type ToolKind = z.output<typeof ToolKindSchema>;

export const ToolCallStatusSchema = z.enum(["pending", "in_progress", "completed", "failed"]);

export const ToolCallStatusOutboundSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

export type ToolCallStatus = z.output<typeof ToolCallStatusSchema>;

export const RoleSchema = z.enum(["assistant", "user"]);

export const RoleOutboundSchema = z.enum(["assistant", "user"]);

export type Role = z.output<typeof RoleSchema>;

export const AnnotationsSchema = z.looseObject({
  audience: z.union([z.array(RoleSchema), z.null()]).optional(),
  lastModified: z.union([z.string(), z.null()]).optional(),
  priority: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AnnotationsOutboundSchema = z.strictObject({
  audience: z.union([z.array(RoleOutboundSchema), z.null()]).optional(),
  lastModified: z.union([z.string(), z.null()]).optional(),
  priority: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Annotations = z.output<typeof AnnotationsSchema>;

export const TextContentSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const TextContentOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  text: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type TextContent = z.output<typeof TextContentSchema>;

export const ImageContentSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  uri: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ImageContentOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  uri: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ImageContent = z.output<typeof ImageContentSchema>;

export const AudioContentSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const AudioContentOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  data: z.string(),
  mimeType: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type AudioContent = z.output<typeof AudioContentSchema>;

export const ResourceLinkSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  name: z.string(),
  size: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  title: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ResourceLinkOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  name: z.string(),
  size: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  title: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ResourceLink = z.output<typeof ResourceLinkSchema>;

export const TextResourceContentsSchema = z.looseObject({
  mimeType: z.union([z.string(), z.null()]).optional(),
  text: z.string(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const TextResourceContentsOutboundSchema = z.strictObject({
  mimeType: z.union([z.string(), z.null()]).optional(),
  text: z.string(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type TextResourceContents = z.output<typeof TextResourceContentsSchema>;

export const BlobResourceContentsSchema = z.looseObject({
  blob: z.string(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const BlobResourceContentsOutboundSchema = z.strictObject({
  blob: z.string(),
  mimeType: z.union([z.string(), z.null()]).optional(),
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type BlobResourceContents = z.output<typeof BlobResourceContentsSchema>;

export const EmbeddedResourceResourceSchema = z.union([
  TextResourceContentsSchema,
  BlobResourceContentsSchema,
]);

export const EmbeddedResourceResourceOutboundSchema = z.union([
  TextResourceContentsOutboundSchema,
  BlobResourceContentsOutboundSchema,
]);

export type EmbeddedResourceResource = z.output<typeof EmbeddedResourceResourceSchema>;

export const EmbeddedResourceSchema = z.looseObject({
  annotations: z.union([AnnotationsSchema, z.null()]).optional(),
  resource: EmbeddedResourceResourceSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const EmbeddedResourceOutboundSchema = z.strictObject({
  annotations: z.union([AnnotationsOutboundSchema, z.null()]).optional(),
  resource: EmbeddedResourceResourceOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type EmbeddedResource = z.output<typeof EmbeddedResourceSchema>;

export const ContentBlockSchema = z.union([
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
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
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

export const ContentBlockOutboundSchema = z.union([
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
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
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

export type ContentBlock = z.output<typeof ContentBlockSchema>;

export const ContentSchema = z.looseObject({
  content: ContentBlockSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ContentOutboundSchema = z.strictObject({
  content: ContentBlockOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Content = z.output<typeof ContentSchema>;

export const DiffSchema = z.looseObject({
  path: z.string(),
  oldText: z.union([z.string(), z.null()]).optional(),
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DiffOutboundSchema = z.strictObject({
  path: z.string(),
  oldText: z.union([z.string(), z.null()]).optional(),
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Diff = z.output<typeof DiffSchema>;
