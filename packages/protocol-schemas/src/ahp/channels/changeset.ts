import * as z from "zod";
import { ErrorInfoSchema, FileEditSchema, StringOrMarkdownSchema } from "../common";

export const ChangesetSchema = z.strictObject({
  label: z.string(),
  uriTemplate: z.string(),
  description: z.string().optional(),
  changeKind: z.string(),
  capabilities: z
    .strictObject({
      review: z.strictObject({}).optional(),
    })
    .optional(),
});

export const ChangesetFileSchema = z.strictObject({
  id: z.string(),
  edit: FileEditSchema,
  reviewed: z.boolean().optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export const ChangesetOperationSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  scopes: z.array(z.enum(["changeset", "resource", "range"])),
  confirmation: StringOrMarkdownSchema.optional(),
  icon: z.string().optional(),
  group: z.string().optional(),
  status: z.enum(["idle", "running", "error", "disabled"]),
  error: ErrorInfoSchema.optional(),
});

export const ChangesetStateSchema = z.strictObject({
  status: z.enum(["computing", "ready", "error"]),
  error: ErrorInfoSchema.optional(),
  files: z.array(ChangesetFileSchema),
  operations: z.array(ChangesetOperationSchema).optional(),
});

export const ChangesetActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("changeset/statusChanged"),
    status: ChangesetStateSchema.shape.status,
    error: ErrorInfoSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("changeset/fileSet"),
    file: ChangesetFileSchema,
  }),
  z.strictObject({
    type: z.literal("changeset/fileRemoved"),
    fileId: z.string(),
  }),
  z.strictObject({
    type: z.literal("changeset/filesReviewChanged"),
    files: z.array(z.string()),
    reviewed: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("changeset/contentChanged"),
    files: z.array(ChangesetFileSchema),
    operations: z.array(ChangesetOperationSchema).optional(),
  }),
  z.strictObject({
    type: z.literal("changeset/operationsChanged"),
    operations: z.array(ChangesetOperationSchema).optional(),
  }),
  z.strictObject({
    type: z.literal("changeset/operationStatusChanged"),
    operationId: z.string(),
    status: ChangesetOperationSchema.shape.status,
    error: ErrorInfoSchema.optional(),
  }),
  z.strictObject({ type: z.literal("changeset/cleared") }),
]);

export type Changeset = z.output<typeof ChangesetSchema>;

export type ChangesetFile = z.output<typeof ChangesetFileSchema>;

export type ChangesetOperation = z.output<typeof ChangesetOperationSchema>;

export type ChangesetState = z.output<typeof ChangesetStateSchema>;

export type ChangesetAction = z.output<typeof ChangesetActionSchema>;
