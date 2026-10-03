// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { RequestIdSchema, RequestIdOutboundSchema } from "./schemas-0";
import { WriteTextFileRequestSchema, WriteTextFileRequestOutboundSchema } from "./schemas-0";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import { ReadTextFileRequestSchema, ReadTextFileRequestOutboundSchema } from "./schemas-0";
import {
  RequestPermissionRequestSchema,
  RequestPermissionRequestOutboundSchema,
} from "./schemas-1";
import { ToolCallIdSchema, ToolCallIdOutboundSchema } from "./schemas-0";
import { CreateTerminalRequestSchema, CreateTerminalRequestOutboundSchema } from "./schemas-1";
import { TerminalOutputRequestSchema, TerminalOutputRequestOutboundSchema } from "./schemas-1";
import { ReleaseTerminalRequestSchema, ReleaseTerminalRequestOutboundSchema } from "./schemas-1";
import {
  WaitForTerminalExitRequestSchema,
  WaitForTerminalExitRequestOutboundSchema,
} from "./schemas-1";
import { KillTerminalRequestSchema, KillTerminalRequestOutboundSchema } from "./schemas-1";
import { ElicitationSchemaTypeSchema, ElicitationSchemaTypeOutboundSchema } from "./schemas-1";
import { StringFormatSchema, StringFormatOutboundSchema } from "./schemas-1";
import { EnumOptionSchema, EnumOptionOutboundSchema } from "./schemas-1";
const IntegerPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  maximum: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  default: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const IntegerPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  maximum: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  default: z
    .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type IntegerPropertySchema = z.output<typeof IntegerPropertySchemaSchema>;
const BooleanPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  default: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const BooleanPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  default: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type BooleanPropertySchema = z.output<typeof BooleanPropertySchemaSchema>;
const StringMultiSelectItemsSchema = z.looseObject({
  enum: z.array(z.string()),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const StringMultiSelectItemsOutboundSchema = z.strictObject({
  enum: z.array(z.string()),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type StringMultiSelectItems = z.output<typeof StringMultiSelectItemsSchema>;
const TitledMultiSelectItemsSchema = z.looseObject({
  anyOf: z.array(EnumOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TitledMultiSelectItemsOutboundSchema = z.strictObject({
  anyOf: z.array(EnumOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type TitledMultiSelectItems = z.output<typeof TitledMultiSelectItemsSchema>;
const MultiSelectItemsSchema = z.union([
  z.looseObject({
    enum: z.array(z.string()),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("string"),
  }),
  z.looseObject({ type: z.string() }).refine((value) => !["string"].includes(value["type"]), {
    message: "Malformed known ACP variant",
  }),
  TitledMultiSelectItemsSchema,
]);
const MultiSelectItemsOutboundSchema = z.union([
  z.strictObject({
    enum: z.array(z.string()),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("string"),
  }),
  z.looseObject({ type: z.string() }).refine((value) => !["string"].includes(value["type"]), {
    message: "Malformed known ACP variant",
  }),
  TitledMultiSelectItemsOutboundSchema,
]);
type MultiSelectItems = z.output<typeof MultiSelectItemsSchema>;
const MultiSelectPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minItems: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  maxItems: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  items: MultiSelectItemsSchema,
  default: z.union([z.array(z.string()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const MultiSelectPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minItems: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  maxItems: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  items: MultiSelectItemsOutboundSchema,
  default: z.union([z.array(z.string()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type MultiSelectPropertySchema = z.output<typeof MultiSelectPropertySchemaSchema>;
const ElicitationPropertySchemaSchema = z.union([
  z.looseObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minLength: z
      .union([
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxLength: z
      .union([
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
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
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
      .optional(),
    maximum: z
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
      .optional(),
    default: z
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
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
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxItems: z
      .union([
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
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
      { message: "Malformed known ACP variant" },
    ),
]);
const ElicitationPropertySchemaOutboundSchema = z.union([
  z.strictObject({
    title: z.union([z.string(), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    minLength: z
      .union([
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxLength: z
      .union([
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
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
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
      .optional(),
    maximum: z
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
      .optional(),
    default: z
      .union([z.number().refine(Number.isInteger, { message: "Expected integer" }), z.null()])
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
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
        z.null(),
      ])
      .optional(),
    maxItems: z
      .union([
        z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
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
      { message: "Malformed known ACP variant" },
    ),
]);
type ElicitationPropertySchema = z.output<typeof ElicitationPropertySchemaSchema>;
const ElicitationSchemaSchema = z.looseObject({
  type: ElicitationSchemaTypeSchema.optional(),
  title: z.union([z.string(), z.null()]).optional(),
  properties: z.record(z.string(), ElicitationPropertySchemaSchema).optional(),
  required: z.union([z.array(z.string()), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ElicitationSchemaOutboundSchema = z.strictObject({
  type: ElicitationSchemaTypeOutboundSchema.optional(),
  title: z.union([z.string(), z.null()]).optional(),
  properties: z.record(z.string(), ElicitationPropertySchemaOutboundSchema).optional(),
  required: z.union([z.array(z.string()), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ElicitationSchema = z.output<typeof ElicitationSchemaSchema>;
const ElicitationSessionScopeSchema = z.looseObject({
  sessionId: SessionIdSchema,
  toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
});
const ElicitationSessionScopeOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
});
type ElicitationSessionScope = z.output<typeof ElicitationSessionScopeSchema>;
const ElicitationRequestScopeSchema = z.looseObject({ requestId: RequestIdSchema });
const ElicitationRequestScopeOutboundSchema = z.strictObject({
  requestId: RequestIdOutboundSchema,
});
type ElicitationRequestScope = z.output<typeof ElicitationRequestScopeSchema>;
const ElicitationFormModeSchema = z.union([
  z.looseObject({
    sessionId: SessionIdSchema,
    toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
    requestedSchema: ElicitationSchemaSchema,
  }),
  z.looseObject({ requestId: RequestIdSchema, requestedSchema: ElicitationSchemaSchema }),
]);
const ElicitationFormModeOutboundSchema = z.union([
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
type ElicitationFormMode = z.output<typeof ElicitationFormModeSchema>;
const ElicitationIdSchema = z.string();
const ElicitationIdOutboundSchema = z.string();
type ElicitationId = z.output<typeof ElicitationIdSchema>;
const ElicitationUrlModeSchema = z.union([
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
const ElicitationUrlModeOutboundSchema = z.union([
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
type ElicitationUrlMode = z.output<typeof ElicitationUrlModeSchema>;
const CreateElicitationRequestSchema = z.union([
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
  z.looseObject({
    sessionId: SessionIdSchema,
    toolCallId: z.union([ToolCallIdSchema, z.null()]).optional(),
    mode: z.string(),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    requestId: RequestIdSchema,
    mode: z.string(),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
const CreateElicitationRequestOutboundSchema = z.union([
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
  z.strictObject({
    sessionId: SessionIdOutboundSchema,
    toolCallId: z.union([ToolCallIdOutboundSchema, z.null()]).optional(),
    mode: z.string(),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    requestId: RequestIdOutboundSchema,
    mode: z.string(),
    message: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
type CreateElicitationRequest = z.output<typeof CreateElicitationRequestSchema>;
const McpServerAcpIdSchema = z.string();
const McpServerAcpIdOutboundSchema = z.string();
type McpServerAcpId = z.output<typeof McpServerAcpIdSchema>;
const McpRequestIdSchema = z.string();
const McpRequestIdOutboundSchema = z.string();
type McpRequestId = z.output<typeof McpRequestIdSchema>;
const MessageMcpRequestSchema = z.looseObject({
  serverId: McpServerAcpIdSchema,
  requestId: McpRequestIdSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const MessageMcpRequestOutboundSchema = z.strictObject({
  serverId: McpServerAcpIdOutboundSchema,
  requestId: McpRequestIdOutboundSchema,
  method: z.string(),
  params: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type MessageMcpRequest = z.output<typeof MessageMcpRequestSchema>;
const ExtRequestSchema = z.unknown();
const ExtRequestOutboundSchema = z.unknown();
type ExtRequest = z.output<typeof ExtRequestSchema>;
const AgentRequestSchema = z.looseObject({
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
const AgentRequestOutboundSchema = z.strictObject({
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
type AgentRequest = z.output<typeof AgentRequestSchema>;
const ProtocolVersionSchema = z
  .number()
  .refine(Number.isInteger, { message: "Expected integer" })
  .check(z.gte(0))
  .check(z.lte(65535));
const ProtocolVersionOutboundSchema = z
  .number()
  .refine(Number.isInteger, { message: "Expected integer" })
  .check(z.gte(0))
  .check(z.lte(65535));
type ProtocolVersion = z.output<typeof ProtocolVersionSchema>;
export {
  IntegerPropertySchemaSchema,
  IntegerPropertySchemaOutboundSchema,
  type IntegerPropertySchema,
  BooleanPropertySchemaSchema,
  BooleanPropertySchemaOutboundSchema,
  type BooleanPropertySchema,
  StringMultiSelectItemsSchema,
  StringMultiSelectItemsOutboundSchema,
  type StringMultiSelectItems,
  TitledMultiSelectItemsSchema,
  TitledMultiSelectItemsOutboundSchema,
  type TitledMultiSelectItems,
  MultiSelectItemsSchema,
  MultiSelectItemsOutboundSchema,
  type MultiSelectItems,
  MultiSelectPropertySchemaSchema,
  MultiSelectPropertySchemaOutboundSchema,
  type MultiSelectPropertySchema,
  ElicitationPropertySchemaSchema,
  ElicitationPropertySchemaOutboundSchema,
  type ElicitationPropertySchema,
  ElicitationSchemaSchema,
  ElicitationSchemaOutboundSchema,
  type ElicitationSchema,
  ElicitationSessionScopeSchema,
  ElicitationSessionScopeOutboundSchema,
  type ElicitationSessionScope,
  ElicitationRequestScopeSchema,
  ElicitationRequestScopeOutboundSchema,
  type ElicitationRequestScope,
  ElicitationFormModeSchema,
  ElicitationFormModeOutboundSchema,
  type ElicitationFormMode,
  ElicitationIdSchema,
  ElicitationIdOutboundSchema,
  type ElicitationId,
  ElicitationUrlModeSchema,
  ElicitationUrlModeOutboundSchema,
  type ElicitationUrlMode,
  CreateElicitationRequestSchema,
  CreateElicitationRequestOutboundSchema,
  type CreateElicitationRequest,
  McpServerAcpIdSchema,
  McpServerAcpIdOutboundSchema,
  type McpServerAcpId,
  McpRequestIdSchema,
  McpRequestIdOutboundSchema,
  type McpRequestId,
  MessageMcpRequestSchema,
  MessageMcpRequestOutboundSchema,
  type MessageMcpRequest,
  ExtRequestSchema,
  ExtRequestOutboundSchema,
  type ExtRequest,
  AgentRequestSchema,
  AgentRequestOutboundSchema,
  type AgentRequest,
  ProtocolVersionSchema,
  ProtocolVersionOutboundSchema,
  type ProtocolVersion,
};
