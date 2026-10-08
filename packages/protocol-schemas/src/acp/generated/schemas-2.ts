// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import {
  RequestIdSchema,
  RequestIdOutboundSchema,
  WriteTextFileRequestSchema,
  WriteTextFileRequestOutboundSchema,
  SessionIdSchema,
  SessionIdOutboundSchema,
  ReadTextFileRequestSchema,
  ReadTextFileRequestOutboundSchema,
  ToolCallIdSchema,
  ToolCallIdOutboundSchema,
} from "./schemas-0";
import {
  RequestPermissionRequestSchema,
  RequestPermissionRequestOutboundSchema,
  CreateTerminalRequestSchema,
  CreateTerminalRequestOutboundSchema,
  TerminalOutputRequestSchema,
  TerminalOutputRequestOutboundSchema,
  ReleaseTerminalRequestSchema,
  ReleaseTerminalRequestOutboundSchema,
  WaitForTerminalExitRequestSchema,
  WaitForTerminalExitRequestOutboundSchema,
  KillTerminalRequestSchema,
  KillTerminalRequestOutboundSchema,
  ElicitationSchemaTypeSchema,
  ElicitationSchemaTypeOutboundSchema,
  StringFormatSchema,
  StringFormatOutboundSchema,
  EnumOptionSchema,
  EnumOptionOutboundSchema,
} from "./schemas-1";

export const IntegerPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  maximum: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  default: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const IntegerPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  maximum: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  default: z
    .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type IntegerPropertySchema = z.output<typeof IntegerPropertySchemaSchema>;

export const BooleanPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  default: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const BooleanPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  default: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type BooleanPropertySchema = z.output<typeof BooleanPropertySchemaSchema>;

export const StringMultiSelectItemsSchema = z.looseObject({
  enum: z.array(z.string()),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const StringMultiSelectItemsOutboundSchema = z.strictObject({
  enum: z.array(z.string()),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type StringMultiSelectItems = z.output<typeof StringMultiSelectItemsSchema>;

export const TitledMultiSelectItemsSchema = z.looseObject({
  anyOf: z.array(EnumOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const TitledMultiSelectItemsOutboundSchema = z.strictObject({
  anyOf: z.array(EnumOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type TitledMultiSelectItems = z.output<typeof TitledMultiSelectItemsSchema>;

export const MultiSelectItemsSchema = z.union([
  z.looseObject({
    enum: z.array(z.string()),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("string"),
  }),
  z.looseObject({ type: z.string() }).refine((value) => !["string"].includes(value["type"]), {
    error: "Malformed known ACP variant",
  }),
  TitledMultiSelectItemsSchema,
]);

export const MultiSelectItemsOutboundSchema = z.union([
  z.strictObject({
    enum: z.array(z.string()),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("string"),
  }),
  z.looseObject({ type: z.string() }).refine((value) => !["string"].includes(value["type"]), {
    error: "Malformed known ACP variant",
  }),
  TitledMultiSelectItemsOutboundSchema,
]);

export type MultiSelectItems = z.output<typeof MultiSelectItemsSchema>;

export const MultiSelectPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minItems: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  maxItems: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  items: MultiSelectItemsSchema,
  default: z.union([z.array(z.string()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const MultiSelectPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minItems: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  maxItems: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  items: MultiSelectItemsOutboundSchema,
  default: z.union([z.array(z.string()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type MultiSelectPropertySchema = z.output<typeof MultiSelectPropertySchemaSchema>;

export const ElicitationPropertySchemaSchema = z.union([
  z.looseObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minLength: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxLength: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    pattern: z.union([z.string(), z.null()]).optional(),
    format: z.union([StringFormatSchema, z.null()]).optional(),
    default: z.union([z.string(), z.null()]).optional(),
    enum: z.union([z.array(z.string()), z.null()]).optional(),
    oneOf: z.union([z.array(EnumOptionSchema), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("string"),
  }),
  z.looseObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minimum: z.union([z.number(), z.null()]).optional(),
    maximum: z.union([z.number(), z.null()]).optional(),
    default: z.union([z.number(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("number"),
  }),
  z.looseObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minimum: z
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
      .optional(),
    maximum: z
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
      .optional(),
    default: z
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
      .optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("integer"),
  }),
  z.looseObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    default: z.union([z.boolean(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("boolean"),
  }),
  z.looseObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minItems: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxItems: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    items: MultiSelectItemsSchema,
    default: z.union([z.array(z.string()), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("array"),
  }),
  z
    .looseObject({ type: z.string() })
    .refine(
      (value) => !["string", "number", "integer", "boolean", "array"].includes(value["type"]),
      { error: "Malformed known ACP variant" },
    ),
]);

export const ElicitationPropertySchemaOutboundSchema = z.union([
  z.strictObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minLength: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxLength: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    pattern: z.union([z.string(), z.null()]).optional(),
    format: z.union([StringFormatOutboundSchema, z.null()]).optional(),
    default: z.union([z.string(), z.null()]).optional(),
    enum: z.union([z.array(z.string()), z.null()]).optional(),
    oneOf: z.union([z.array(EnumOptionOutboundSchema), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("string"),
  }),
  z.strictObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minimum: z.union([z.number(), z.null()]).optional(),
    maximum: z.union([z.number(), z.null()]).optional(),
    default: z.union([z.number(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("number"),
  }),
  z.strictObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minimum: z
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
      .optional(),
    maximum: z
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
      .optional(),
    default: z
      .union([z.number().refine(Number.isInteger, { error: "Expected integer" }), z.null()])
      .optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("integer"),
  }),
  z.strictObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    default: z.union([z.boolean(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("boolean"),
  }),
  z.strictObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minItems: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxItems: z
      .union([
        z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    items: MultiSelectItemsOutboundSchema,
    default: z.union([z.array(z.string()), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("array"),
  }),
  z
    .looseObject({ type: z.string() })
    .refine(
      (value) => !["string", "number", "integer", "boolean", "array"].includes(value["type"]),
      { error: "Malformed known ACP variant" },
    ),
]);

export type ElicitationPropertySchema = z.output<typeof ElicitationPropertySchemaSchema>;

export const ElicitationSchemaSchema = z.looseObject({
  type: ElicitationSchemaTypeSchema.optional(),
  title: z.union([z.string(), z.null()]).optional(),
  properties: z.record(z.string(), ElicitationPropertySchemaSchema).optional(),
  required: z.union([z.array(z.string()), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ElicitationSchemaOutboundSchema = z.strictObject({
  type: ElicitationSchemaTypeOutboundSchema.optional(),
  title: z.union([z.string(), z.null()]).optional(),
  properties: z.record(z.string(), ElicitationPropertySchemaOutboundSchema).optional(),
  required: z.union([z.array(z.string()), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ElicitationSchema = z.output<typeof ElicitationSchemaSchema>;

export const ElicitationSessionScopeSchema = z.looseObject({
  sessionId: SessionIdSchema,
  toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
});

export const ElicitationSessionScopeOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
});

export type ElicitationSessionScope = z.output<typeof ElicitationSessionScopeSchema>;

export const ElicitationRequestScopeSchema = z.looseObject({ requestId: RequestIdSchema });

export const ElicitationRequestScopeOutboundSchema = z.strictObject({
  requestId: RequestIdOutboundSchema,
});

export type ElicitationRequestScope = z.output<typeof ElicitationRequestScopeSchema>;

export const ElicitationFormModeSchema = z.union([
  z.looseObject({
    sessionId: SessionIdSchema,
    toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
    requestedSchema: ElicitationSchemaSchema,
  }),
  z.looseObject({ requestId: RequestIdSchema, requestedSchema: ElicitationSchemaSchema }),
]);

export const ElicitationFormModeOutboundSchema = z.union([
  z.strictObject({
    sessionId: SessionIdOutboundSchema,
    toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
    requestedSchema: ElicitationSchemaOutboundSchema,
  }),
  z.strictObject({
    requestId: RequestIdOutboundSchema,
    requestedSchema: ElicitationSchemaOutboundSchema,
  }),
]);

export type ElicitationFormMode = z.output<typeof ElicitationFormModeSchema>;

export const ElicitationIdSchema = z.string();

export const ElicitationIdOutboundSchema = z.string();

export type ElicitationId = z.output<typeof ElicitationIdSchema>;

export const ElicitationUrlModeSchema = z.union([
  z.looseObject({
    sessionId: SessionIdSchema,
    toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
    elicitationId: ElicitationIdSchema,
    url: z.string(),
  }),
  z.looseObject({
    requestId: RequestIdSchema,
    elicitationId: ElicitationIdSchema,
    url: z.string(),
  }),
]);

export const ElicitationUrlModeOutboundSchema = z.union([
  z.strictObject({
    sessionId: SessionIdOutboundSchema,
    toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
    elicitationId: ElicitationIdOutboundSchema,
    url: z.string(),
  }),
  z.strictObject({
    requestId: RequestIdOutboundSchema,
    elicitationId: ElicitationIdOutboundSchema,
    url: z.string(),
  }),
]);

export type ElicitationUrlMode = z.output<typeof ElicitationUrlModeSchema>;

export const CreateElicitationRequestSchema = z.union([
  z.looseObject({
    sessionId: SessionIdSchema,
    toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
    requestedSchema: ElicitationSchemaSchema,
    mode: z.literal("form"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    requestId: RequestIdSchema,
    requestedSchema: ElicitationSchemaSchema,
    mode: z.literal("form"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    sessionId: SessionIdSchema,
    toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
    elicitationId: ElicitationIdSchema,
    url: z.string(),
    mode: z.literal("url"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    requestId: RequestIdSchema,
    elicitationId: ElicitationIdSchema,
    url: z.string(),
    mode: z.literal("url"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z
    .looseObject({
      sessionId: SessionIdSchema,
      toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
      mode: z.string(),
      message: z.string(),
      _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    })
    .refine((value) => !["form", "url"].includes(value["mode"]), {
      error: "Malformed known ACP variant",
    }),
  z
    .looseObject({
      requestId: RequestIdSchema,
      mode: z.string(),
      message: z.string(),
      _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    })
    .refine((value) => !["form", "url"].includes(value["mode"]), {
      error: "Malformed known ACP variant",
    }),
]);

export const CreateElicitationRequestOutboundSchema = z.union([
  z.strictObject({
    sessionId: SessionIdOutboundSchema,
    toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
    requestedSchema: ElicitationSchemaOutboundSchema,
    mode: z.literal("form"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    requestId: RequestIdOutboundSchema,
    requestedSchema: ElicitationSchemaOutboundSchema,
    mode: z.literal("form"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    sessionId: SessionIdOutboundSchema,
    toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
    elicitationId: ElicitationIdOutboundSchema,
    url: z.string(),
    mode: z.literal("url"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    requestId: RequestIdOutboundSchema,
    elicitationId: ElicitationIdOutboundSchema,
    url: z.string(),
    mode: z.literal("url"),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z
    .looseObject({
      sessionId: SessionIdOutboundSchema,
      toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
      mode: z.string(),
      message: z.string(),
      _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    })
    .refine((value) => !["form", "url"].includes(value["mode"]), {
      error: "Malformed known ACP variant",
    }),
  z
    .looseObject({
      requestId: RequestIdOutboundSchema,
      mode: z.string(),
      message: z.string(),
      _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    })
    .refine((value) => !["form", "url"].includes(value["mode"]), {
      error: "Malformed known ACP variant",
    }),
]);

export type CreateElicitationRequest = z.output<typeof CreateElicitationRequestSchema>;

export const McpServerAcpIdSchema = z.string();

export const McpServerAcpIdOutboundSchema = z.string();

export type McpServerAcpId = z.output<typeof McpServerAcpIdSchema>;

export const McpRequestIdSchema = z.string();

export const McpRequestIdOutboundSchema = z.string();

export type McpRequestId = z.output<typeof McpRequestIdSchema>;

export const MessageMcpRequestSchema = z.looseObject({
  serverId: McpServerAcpIdSchema,
  requestId: McpRequestIdSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const MessageMcpRequestOutboundSchema = z.strictObject({
  serverId: McpServerAcpIdOutboundSchema,
  requestId: McpRequestIdOutboundSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type MessageMcpRequest = z.output<typeof MessageMcpRequestSchema>;

export const ExtRequestSchema = z.unknown();

export const ExtRequestOutboundSchema = z.unknown();

export type ExtRequest = z.output<typeof ExtRequestSchema>;

export const AgentRequestSchema = z.looseObject({
  id: RequestIdSchema,
  method: z.string(),
  params: z
    .union([
      z.union([
        WriteTextFileRequestSchema,
        ReadTextFileRequestSchema,
        RequestPermissionRequestSchema,
        CreateTerminalRequestSchema,
        TerminalOutputRequestSchema,
        ReleaseTerminalRequestSchema,
        WaitForTerminalExitRequestSchema,
        KillTerminalRequestSchema,
        CreateElicitationRequestSchema,
        MessageMcpRequestSchema,
        ExtRequestSchema,
      ]),
      z.null(),
    ])
    .optional(),
});

export const AgentRequestOutboundSchema = z.strictObject({
  id: RequestIdOutboundSchema,
  method: z.string(),
  params: z
    .union([
      z.union([
        WriteTextFileRequestOutboundSchema,
        ReadTextFileRequestOutboundSchema,
        RequestPermissionRequestOutboundSchema,
        CreateTerminalRequestOutboundSchema,
        TerminalOutputRequestOutboundSchema,
        ReleaseTerminalRequestOutboundSchema,
        WaitForTerminalExitRequestOutboundSchema,
        KillTerminalRequestOutboundSchema,
        CreateElicitationRequestOutboundSchema,
        MessageMcpRequestOutboundSchema,
        ExtRequestOutboundSchema,
      ]),
      z.null(),
    ])
    .optional(),
});

export type AgentRequest = z.output<typeof AgentRequestSchema>;

export const ProtocolVersionSchema = z
  .number()
  .refine(Number.isInteger, { error: "Expected integer" })
  .check(z.gte(0))
  .check(z.lte(65535));

export const ProtocolVersionOutboundSchema = z
  .number()
  .refine(Number.isInteger, { error: "Expected integer" })
  .check(z.gte(0))
  .check(z.lte(65535));

export type ProtocolVersion = z.output<typeof ProtocolVersionSchema>;
