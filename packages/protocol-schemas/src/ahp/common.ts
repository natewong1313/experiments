import * as z from "zod";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const uriSchema = z.string();

export const metaSchema = z.record(z.string(), z.unknown());

const MIN_SEQUENCE = 0;

const MIN_CLIENT_ID_LENGTH = 1;

export const clientIdSchema = z.string().min(MIN_CLIENT_ID_LENGTH);

export const seqSchema = z
  .number()
  .refine((value) => Number.isSafeInteger(value) && value >= MIN_SEQUENCE, {
    error: "Expected a nonnegative safe integer sequence number",
  });

export const isoTimestampSchema = z.iso.datetime({
  offset: true,
  message: "Expected an ISO 8601 timestamp",
});

export const jsonPrimitiveSchema: z.ZodType<JsonPrimitive> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => {
  return z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]);
});

export const StringOrMarkdownSchema = z.union([
  z.string(),
  z.strictObject({ markdown: z.string() }),
]);

export const IconSchema = z.strictObject({
  src: uriSchema,
  contentType: z.string().optional(),
  sizes: z.array(z.string()).optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

export const ProtectedResourceMetadataSchema = z.strictObject({
  resource: z.string(),
  resource_name: z.string().optional(),
  authorization_servers: z.array(z.string()).optional(),
  jwks_uri: z.string().optional(),
  scopes_supported: z.array(z.string()).optional(),
  bearer_methods_supported: z.array(z.string()).optional(),
  resource_signing_alg_values_supported: z.array(z.string()).optional(),
  resource_documentation: z.string().optional(),
  resource_policy_uri: z.string().optional(),
  resource_tos_uri: z.string().optional(),
  required: z.boolean().optional(),
});

export const TextPositionSchema = z.strictObject({
  line: z.number(),
  character: z.number(),
});

export const TextRangeSchema = z.strictObject({
  start: TextPositionSchema,
  end: TextPositionSchema,
});

export const TextSelectionSchema = z.strictObject({
  range: TextRangeSchema,
});

export const ContentRefSchema = z.strictObject({
  uri: uriSchema,
  sizeHint: z.number().optional(),
  contentType: z.string().optional(),
  nonce: z.string().optional(),
});

export const FileEditSchema = z.strictObject({
  before: z
    .strictObject({
      uri: uriSchema,
      content: ContentRefSchema,
    })
    .optional(),
  after: z
    .strictObject({
      uri: uriSchema,
      content: ContentRefSchema,
    })
    .optional(),
  diff: z
    .strictObject({
      added: z.number().optional(),
      removed: z.number().optional(),
    })
    .optional(),
});

export const UsageInfoSchema = z.strictObject({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  model: z.string().optional(),
  cacheReadTokens: z.number().optional(),
  _meta: metaSchema.optional(),
});

export const ErrorInfoSchema = z.strictObject({
  errorType: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  _meta: metaSchema.optional(),
});

export const configPropertyFields = {
  type: z.enum(["string", "number", "boolean", "array", "object"]),
  title: z.string(),
  description: z.string().optional(),
  default: z.unknown().optional(),
  enum: z.array(jsonPrimitiveSchema).optional(),
  enumLabels: z.array(z.string()).optional(),
  enumDescriptions: z.array(z.string()).optional(),
  readOnly: z.boolean().optional(),
  required: z.array(z.string()).optional(),
};

export const ConfigPropertySchema: z.ZodType<ConfigProperty> = z.lazy(() => {
  return z.strictObject({
    ...configPropertyFields,
    items: configPropertySchemaLazy.optional(),
    properties: z.record(z.string(), configPropertySchemaLazy).optional(),
    additionalProperties: configPropertySchemaLazy.optional(),
  });
});

const configPropertySchemaLazy = ConfigPropertySchema;

export const ConfigSchemaSchema = z.strictObject({
  type: z.literal("object"),
  properties: z.record(z.string(), ConfigPropertySchema),
  required: z.array(z.string()).optional(),
});

export type ConfigProperty = {
  type: "string" | "number" | "boolean" | "array" | "object";
  title: string;
  description?: string;
  default?: unknown;
  enum?: JsonPrimitive[];
  enumLabels?: string[];
  enumDescriptions?: string[];
  readOnly?: boolean;
  items?: ConfigProperty;
  properties?: Record<string, ConfigProperty>;
  required?: string[];
  additionalProperties?: ConfigProperty;
};

export type Uri = z.output<typeof uriSchema>;

export type Meta = z.output<typeof metaSchema>;

export type Seq = z.output<typeof seqSchema>;

export type StringOrMarkdown = z.output<typeof StringOrMarkdownSchema>;

export type Icon = z.output<typeof IconSchema>;

export type ProtectedResourceMetadata = z.output<typeof ProtectedResourceMetadataSchema>;

export type TextPosition = z.output<typeof TextPositionSchema>;

export type TextRange = z.output<typeof TextRangeSchema>;

export type TextSelection = z.output<typeof TextSelectionSchema>;

export type ContentRef = z.output<typeof ContentRefSchema>;

export type FileEdit = z.output<typeof FileEditSchema>;

export type UsageInfo = z.output<typeof UsageInfoSchema>;

export type ErrorInfo = z.output<typeof ErrorInfoSchema>;

export type ConfigSchema = z.output<typeof ConfigSchemaSchema>;
