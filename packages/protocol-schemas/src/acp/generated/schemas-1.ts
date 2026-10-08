// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import {
  SessionIdSchema,
  SessionIdOutboundSchema,
  ToolCallIdSchema,
  ToolCallIdOutboundSchema,
  ToolKindSchema,
  ToolKindOutboundSchema,
  ToolCallStatusSchema,
  ToolCallStatusOutboundSchema,
  ContentBlockSchema,
  ContentBlockOutboundSchema,
} from "./schemas-0";

export const TerminalIdSchema = z.string();

export const TerminalIdOutboundSchema = z.string();

export type TerminalId = z.output<typeof TerminalIdSchema>;

export const TerminalSchema = z.looseObject({
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const TerminalOutboundSchema = z.strictObject({
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Terminal = z.output<typeof TerminalSchema>;

export const ToolCallContentSchema = z.union([
  z.looseObject({
    content: ContentBlockSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("content"),
  }),
  z.looseObject({
    path: z.string(),
    oldText: z.union([z.string(), z.null()]).optional(),
    newText: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("diff"),
  }),
  z.looseObject({
    terminalId: TerminalIdSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("terminal"),
  }),
]);

export const ToolCallContentOutboundSchema = z.union([
  z.strictObject({
    content: ContentBlockOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("content"),
  }),
  z.strictObject({
    path: z.string(),
    oldText: z.union([z.string(), z.null()]).optional(),
    newText: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("diff"),
  }),
  z.strictObject({
    terminalId: TerminalIdOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("terminal"),
  }),
]);

export type ToolCallContent = z.output<typeof ToolCallContentSchema>;

export const ToolCallLocationSchema = z.looseObject({
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ToolCallLocationOutboundSchema = z.strictObject({
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ToolCallLocation = z.output<typeof ToolCallLocationSchema>;

export const ToolCallUpdateSchema = z.looseObject({
  toolCallId: ToolCallIdSchema,
  kind: z.union([ToolKindSchema, z.null()]).optional(),
  status: z.union([ToolCallStatusSchema, z.null()]).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  name: z.union([z.string(), z.null()]).optional(),
  content: z.union([z.array(ToolCallContentSchema), z.null()]).optional(),
  locations: z.union([z.array(ToolCallLocationSchema), z.null()]).optional(),
  rawInput: z.unknown().optional(),
  rawOutput: z.unknown().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ToolCallUpdateOutboundSchema = z.strictObject({
  toolCallId: ToolCallIdOutboundSchema,
  kind: z.union([ToolKindOutboundSchema, z.null()]).optional(),
  status: z.union([ToolCallStatusOutboundSchema, z.null()]).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  name: z.union([z.string(), z.null()]).optional(),
  content: z.union([z.array(ToolCallContentOutboundSchema), z.null()]).optional(),
  locations: z.union([z.array(ToolCallLocationOutboundSchema), z.null()]).optional(),
  rawInput: z.unknown().optional(),
  rawOutput: z.unknown().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ToolCallUpdate = z.output<typeof ToolCallUpdateSchema>;

export const PermissionOptionIdSchema = z.string();

export const PermissionOptionIdOutboundSchema = z.string();

export type PermissionOptionId = z.output<typeof PermissionOptionIdSchema>;

export const PermissionOptionKindSchema = z.enum([
  "allow_once",
  "allow_always",
  "reject_once",
  "reject_always",
]);

export const PermissionOptionKindOutboundSchema = z.enum([
  "allow_once",
  "allow_always",
  "reject_once",
  "reject_always",
]);

export type PermissionOptionKind = z.output<typeof PermissionOptionKindSchema>;

export const PermissionOptionSchema = z.looseObject({
  optionId: PermissionOptionIdSchema,
  name: z.string(),
  kind: PermissionOptionKindSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PermissionOptionOutboundSchema = z.strictObject({
  optionId: PermissionOptionIdOutboundSchema,
  name: z.string(),
  kind: PermissionOptionKindOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PermissionOption = z.output<typeof PermissionOptionSchema>;

export const RequestPermissionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  toolCall: ToolCallUpdateSchema,
  options: z.array(PermissionOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const RequestPermissionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  toolCall: ToolCallUpdateOutboundSchema,
  options: z.array(PermissionOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type RequestPermissionRequest = z.output<typeof RequestPermissionRequestSchema>;

export const EnvVariableSchema = z.looseObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const EnvVariableOutboundSchema = z.strictObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type EnvVariable = z.output<typeof EnvVariableSchema>;

export const CreateTerminalRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.array(EnvVariableSchema).optional(),
  cwd: z.union([z.string(), z.null()]).optional(),
  outputByteLimit: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CreateTerminalRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.array(EnvVariableOutboundSchema).optional(),
  cwd: z.union([z.string(), z.null()]).optional(),
  outputByteLimit: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CreateTerminalRequest = z.output<typeof CreateTerminalRequestSchema>;

export const TerminalOutputRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const TerminalOutputRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type TerminalOutputRequest = z.output<typeof TerminalOutputRequestSchema>;

export const ReleaseTerminalRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ReleaseTerminalRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ReleaseTerminalRequest = z.output<typeof ReleaseTerminalRequestSchema>;

export const WaitForTerminalExitRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const WaitForTerminalExitRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type WaitForTerminalExitRequest = z.output<typeof WaitForTerminalExitRequestSchema>;

export const KillTerminalRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const KillTerminalRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type KillTerminalRequest = z.output<typeof KillTerminalRequestSchema>;

export const ElicitationSchemaTypeSchema = z.enum(["object"]);

export const ElicitationSchemaTypeOutboundSchema = z.enum(["object"]);

export type ElicitationSchemaType = z.output<typeof ElicitationSchemaTypeSchema>;

export const StringFormatSchema = z.enum(["email", "uri", "date", "date-time"]);

export const StringFormatOutboundSchema = z.enum(["email", "uri", "date", "date-time"]);

export type StringFormat = z.output<typeof StringFormatSchema>;

export const EnumOptionSchema = z.looseObject({
  const: z.string(),
  title: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const EnumOptionOutboundSchema = z.strictObject({
  const: z.string(),
  title: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type EnumOption = z.output<typeof EnumOptionSchema>;

export const StringPropertySchemaSchema = z.looseObject({
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
});

export const StringPropertySchemaOutboundSchema = z.strictObject({
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
});

export type StringPropertySchema = z.output<typeof StringPropertySchemaSchema>;

export const NumberPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z.union([z.number(), z.null()]).optional(),
  maximum: z.union([z.number(), z.null()]).optional(),
  default: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NumberPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z.union([z.number(), z.null()]).optional(),
  maximum: z.union([z.number(), z.null()]).optional(),
  default: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NumberPropertySchema = z.output<typeof NumberPropertySchemaSchema>;
