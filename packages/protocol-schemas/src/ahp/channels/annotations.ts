import * as z from "zod";
import { StringOrMarkdownSchema, TextRangeSchema, metaSchema, uriSchema } from "../common";

export const AnnotationsSummarySchema = z.strictObject({
  resource: uriSchema,
  annotationCount: z.number(),
  entryCount: z.number(),
});

export const AnnotationOriginSchema = z.strictObject({
  session: uriSchema,
  chat: uriSchema.optional(),
  turnId: z.string().optional(),
});

export const AnnotationEntrySchema = z.strictObject({
  id: z.string(),
  text: StringOrMarkdownSchema,
  _meta: metaSchema.optional(),
});

export const AnnotationSchema = z.strictObject({
  id: z.string(),
  origin: AnnotationOriginSchema,
  resource: uriSchema,
  range: TextRangeSchema.optional(),
  resolved: z.boolean(),
  entries: z.array(AnnotationEntrySchema),
  _meta: metaSchema.optional(),
});

export const AnnotationsStateSchema = z.strictObject({
  annotations: z.array(AnnotationSchema),
});

export const AnnotationsActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("annotations/set"),
    annotation: AnnotationSchema,
  }),
  z.strictObject({
    type: z.literal("annotations/updated"),
    annotationId: z.string(),
    origin: AnnotationOriginSchema.optional(),
    resource: uriSchema.optional(),
    range: TextRangeSchema.optional(),
    resolved: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("annotations/removed"),
    annotationId: z.string(),
  }),
  z.strictObject({
    type: z.literal("annotations/entrySet"),
    annotationId: z.string(),
    entry: AnnotationEntrySchema,
  }),
  z.strictObject({
    type: z.literal("annotations/entryRemoved"),
    annotationId: z.string(),
    entryId: z.string(),
  }),
]);

export type AnnotationsSummary = z.output<typeof AnnotationsSummarySchema>;

export type AnnotationOrigin = z.output<typeof AnnotationOriginSchema>;

export type AnnotationEntry = z.output<typeof AnnotationEntrySchema>;

export type Annotation = z.output<typeof AnnotationSchema>;

export type AnnotationsState = z.output<typeof AnnotationsStateSchema>;

export type AnnotationsAction = z.output<typeof AnnotationsActionSchema>;
