// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import { ToolCallIdSchema, ToolCallIdOutboundSchema } from "./schemas-0";
import { ToolKindSchema, ToolKindOutboundSchema } from "./schemas-0";
import { ToolCallStatusSchema, ToolCallStatusOutboundSchema } from "./schemas-0";
import { ContentBlockSchema, ContentBlockOutboundSchema } from "./schemas-0";
const TerminalIdSchema = z.string();
const TerminalIdOutboundSchema = z.string();
type TerminalId = z.output<typeof TerminalIdSchema>;
const TerminalSchema = z.looseObject({
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TerminalOutboundSchema = z.strictObject({
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type Terminal = z.output<typeof TerminalSchema>;
const ToolCallContentSchema = z.union([
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
const ToolCallContentOutboundSchema = z.union([
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
type ToolCallContent = z.output<typeof ToolCallContentSchema>;
const ToolCallLocationSchema = z.looseObject({
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ToolCallLocationOutboundSchema = z.strictObject({
  path: z.string(),
  line: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ToolCallLocation = z.output<typeof ToolCallLocationSchema>;
const ToolCallUpdateSchema = z.looseObject({
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
const ToolCallUpdateOutboundSchema = z.strictObject({
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
type ToolCallUpdate = z.output<typeof ToolCallUpdateSchema>;
const PermissionOptionIdSchema = z.string();
const PermissionOptionIdOutboundSchema = z.string();
type PermissionOptionId = z.output<typeof PermissionOptionIdSchema>;
const PermissionOptionKindSchema = z.union([
  z.literal("allow_once"),
  z.literal("allow_always"),
  z.literal("reject_once"),
  z.literal("reject_always"),
]);
const PermissionOptionKindOutboundSchema = z.union([
  z.literal("allow_once"),
  z.literal("allow_always"),
  z.literal("reject_once"),
  z.literal("reject_always"),
]);
type PermissionOptionKind = z.output<typeof PermissionOptionKindSchema>;
const PermissionOptionSchema = z.looseObject({
  optionId: PermissionOptionIdSchema,
  name: z.string(),
  kind: PermissionOptionKindSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PermissionOptionOutboundSchema = z.strictObject({
  optionId: PermissionOptionIdOutboundSchema,
  name: z.string(),
  kind: PermissionOptionKindOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PermissionOption = z.output<typeof PermissionOptionSchema>;
const RequestPermissionRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  toolCall: ToolCallUpdateSchema,
  options: z.array(PermissionOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const RequestPermissionRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  toolCall: ToolCallUpdateOutboundSchema,
  options: z.array(PermissionOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type RequestPermissionRequest = z.output<typeof RequestPermissionRequestSchema>;
const EnvVariableSchema = z.looseObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const EnvVariableOutboundSchema = z.strictObject({
  name: z.string(),
  value: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type EnvVariable = z.output<typeof EnvVariableSchema>;
const CreateTerminalRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.array(EnvVariableSchema).optional(),
  cwd: z.union([z.string(), z.null()]).optional(),
  outputByteLimit: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CreateTerminalRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.array(EnvVariableOutboundSchema).optional(),
  cwd: z.union([z.string(), z.null()]).optional(),
  outputByteLimit: z
    .union([
      z.number().refine(Number.isInteger, { message: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CreateTerminalRequest = z.output<typeof CreateTerminalRequestSchema>;
const TerminalOutputRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const TerminalOutputRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type TerminalOutputRequest = z.output<typeof TerminalOutputRequestSchema>;
const ReleaseTerminalRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ReleaseTerminalRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ReleaseTerminalRequest = z.output<typeof ReleaseTerminalRequestSchema>;
const WaitForTerminalExitRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const WaitForTerminalExitRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type WaitForTerminalExitRequest = z.output<typeof WaitForTerminalExitRequestSchema>;
const KillTerminalRequestSchema = z.looseObject({
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const KillTerminalRequestOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  terminalId: TerminalIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type KillTerminalRequest = z.output<typeof KillTerminalRequestSchema>;
const ElicitationSchemaTypeSchema = z.literal("object");
const ElicitationSchemaTypeOutboundSchema = z.literal("object");
type ElicitationSchemaType = z.output<typeof ElicitationSchemaTypeSchema>;
const StringFormatSchema = z.union([
  z.literal("email"),
  z.literal("uri"),
  z.literal("date"),
  z.literal("date-time"),
]);
const StringFormatOutboundSchema = z.union([
  z.literal("email"),
  z.literal("uri"),
  z.literal("date"),
  z.literal("date-time"),
]);
type StringFormat = z.output<typeof StringFormatSchema>;
const EnumOptionSchema = z.looseObject({
  const: z.string(),
  title: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const EnumOptionOutboundSchema = z.strictObject({
  const: z.string(),
  title: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type EnumOption = z.output<typeof EnumOptionSchema>;
const StringPropertySchemaSchema = z.looseObject({
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
});
const StringPropertySchemaOutboundSchema = z.strictObject({
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
});
type StringPropertySchema = z.output<typeof StringPropertySchemaSchema>;
const NumberPropertySchemaSchema = z.looseObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z.union([z.number(), z.null()]).optional(),
  maximum: z.union([z.number(), z.null()]).optional(),
  default: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NumberPropertySchemaOutboundSchema = z.strictObject({
  title: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  minimum: z.union([z.number(), z.null()]).optional(),
  maximum: z.union([z.number(), z.null()]).optional(),
  default: z.union([z.number(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NumberPropertySchema = z.output<typeof NumberPropertySchemaSchema>;
export {
  TerminalIdSchema,
  TerminalIdOutboundSchema,
  type TerminalId,
  TerminalSchema,
  TerminalOutboundSchema,
  type Terminal,
  ToolCallContentSchema,
  ToolCallContentOutboundSchema,
  type ToolCallContent,
  ToolCallLocationSchema,
  ToolCallLocationOutboundSchema,
  type ToolCallLocation,
  ToolCallUpdateSchema,
  ToolCallUpdateOutboundSchema,
  type ToolCallUpdate,
  PermissionOptionIdSchema,
  PermissionOptionIdOutboundSchema,
  type PermissionOptionId,
  PermissionOptionKindSchema,
  PermissionOptionKindOutboundSchema,
  type PermissionOptionKind,
  PermissionOptionSchema,
  PermissionOptionOutboundSchema,
  type PermissionOption,
  RequestPermissionRequestSchema,
  RequestPermissionRequestOutboundSchema,
  type RequestPermissionRequest,
  EnvVariableSchema,
  EnvVariableOutboundSchema,
  type EnvVariable,
  CreateTerminalRequestSchema,
  CreateTerminalRequestOutboundSchema,
  type CreateTerminalRequest,
  TerminalOutputRequestSchema,
  TerminalOutputRequestOutboundSchema,
  type TerminalOutputRequest,
  ReleaseTerminalRequestSchema,
  ReleaseTerminalRequestOutboundSchema,
  type ReleaseTerminalRequest,
  WaitForTerminalExitRequestSchema,
  WaitForTerminalExitRequestOutboundSchema,
  type WaitForTerminalExitRequest,
  KillTerminalRequestSchema,
  KillTerminalRequestOutboundSchema,
  type KillTerminalRequest,
  ElicitationSchemaTypeSchema,
  ElicitationSchemaTypeOutboundSchema,
  type ElicitationSchemaType,
  StringFormatSchema,
  StringFormatOutboundSchema,
  type StringFormat,
  EnumOptionSchema,
  EnumOptionOutboundSchema,
  type EnumOption,
  StringPropertySchemaSchema,
  StringPropertySchemaOutboundSchema,
  type StringPropertySchema,
  NumberPropertySchemaSchema,
  NumberPropertySchemaOutboundSchema,
  type NumberPropertySchema,
};
