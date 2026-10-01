import * as z from "zod";
import {
  StringOrMarkdownSchema,
  TextRangeSchema,
  metaSchema,
  uriSchema,
} from "../common";

const AnnotationsSummarySchema = z.strictObject({
  resource: uriSchema,
  annotationCount: z.number(),
  entryCount: z.number(),
});

const AnnotationOriginSchema = z.strictObject({
  session: uriSchema,
  chat: uriSchema.optional(),
  turnId: z.string().optional(),
});

const AnnotationEntrySchema = z.strictObject({
  id: z.string(),
  text: StringOrMarkdownSchema,
  _meta: metaSchema.optional(),
});

const AnnotationSchema = z.strictObject({
  id: z.string(),
  origin: AnnotationOriginSchema,
  resource: uriSchema,
  range: TextRangeSchema.optional(),
  resolved: z.boolean(),
  entries: z.array(AnnotationEntrySchema),
  _meta: metaSchema.optional(),
});

const AnnotationsStateSchema = z.strictObject({
  annotations: z.array(AnnotationSchema),
});

const AnnotationsActionSchema = z.discriminatedUnion("type", [
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

type AnnotationsSummary = z.output<typeof AnnotationsSummarySchema>;
type AnnotationOrigin = z.output<typeof AnnotationOriginSchema>;
type AnnotationEntry = z.output<typeof AnnotationEntrySchema>;
type Annotation = z.output<typeof AnnotationSchema>;
type AnnotationsState = z.output<typeof AnnotationsStateSchema>;
type AnnotationsAction = z.output<typeof AnnotationsActionSchema>;

export {
  AnnotationEntrySchema,
  AnnotationOriginSchema,
  AnnotationSchema,
  AnnotationsActionSchema,
  AnnotationsStateSchema,
  AnnotationsSummarySchema,
  type Annotation,
  type AnnotationEntry,
  type AnnotationOrigin,
  type AnnotationsAction,
  type AnnotationsState,
  type AnnotationsSummary,
};
