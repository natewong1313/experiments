// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import { ProviderIdSchema, ProviderIdOutboundSchema } from "./schemas-4";
import { LlmProtocolSchema, LlmProtocolOutboundSchema } from "./schemas-4";
import { ProviderCurrentConfigSchema, ProviderCurrentConfigOutboundSchema } from "./schemas-4";
const ProviderInfoSchema = z.looseObject({
  providerId: ProviderIdSchema,
  supported: z.array(LlmProtocolSchema),
  required: z.boolean(),
  current: z.union([ProviderCurrentConfigSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ProviderInfoOutboundSchema = z.strictObject({
  providerId: ProviderIdOutboundSchema,
  supported: z.array(LlmProtocolOutboundSchema),
  required: z.boolean(),
  current: z.union([ProviderCurrentConfigOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ProviderInfo = z.output<typeof ProviderInfoSchema>;
const ListProvidersResponseSchema = z.looseObject({
  providers: z.array(ProviderInfoSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ListProvidersResponseOutboundSchema = z.strictObject({
  providers: z.array(ProviderInfoOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ListProvidersResponse = z.output<typeof ListProvidersResponseSchema>;
const SetProviderResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SetProviderResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SetProviderResponse = z.output<typeof SetProviderResponseSchema>;
const DisableProviderResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const DisableProviderResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type DisableProviderResponse = z.output<typeof DisableProviderResponseSchema>;
const LogoutResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const LogoutResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type LogoutResponse = z.output<typeof LogoutResponseSchema>;
const SessionModeIdSchema = z.string();
const SessionModeIdOutboundSchema = z.string();
type SessionModeId = z.output<typeof SessionModeIdSchema>;
const SessionModeSchema = z.looseObject({
  id: SessionModeIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionModeOutboundSchema = z.strictObject({
  id: SessionModeIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionMode = z.output<typeof SessionModeSchema>;
const SessionModeStateSchema = z.looseObject({
  currentModeId: SessionModeIdSchema,
  availableModes: z.array(SessionModeSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionModeStateOutboundSchema = z.strictObject({
  currentModeId: SessionModeIdOutboundSchema,
  availableModes: z.array(SessionModeOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionModeState = z.output<typeof SessionModeStateSchema>;
const SessionConfigIdSchema = z.string();
const SessionConfigIdOutboundSchema = z.string();
type SessionConfigId = z.output<typeof SessionConfigIdSchema>;
const SessionConfigOptionCategorySchema = z.union([
  z.literal("mode"),
  z.literal("model"),
  z.literal("model_config"),
  z.literal("thought_level"),
  z.string(),
]);
const SessionConfigOptionCategoryOutboundSchema = z.union([
  z.literal("mode"),
  z.literal("model"),
  z.literal("model_config"),
  z.literal("thought_level"),
  z.string(),
]);
type SessionConfigOptionCategory = z.output<typeof SessionConfigOptionCategorySchema>;
const SessionConfigValueIdSchema = z.string();
const SessionConfigValueIdOutboundSchema = z.string();
type SessionConfigValueId = z.output<typeof SessionConfigValueIdSchema>;
const SessionConfigSelectOptionSchema = z.looseObject({
  value: SessionConfigValueIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionConfigSelectOptionOutboundSchema = z.strictObject({
  value: SessionConfigValueIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionConfigSelectOption = z.output<typeof SessionConfigSelectOptionSchema>;
const SessionConfigGroupIdSchema = z.string();
const SessionConfigGroupIdOutboundSchema = z.string();
type SessionConfigGroupId = z.output<typeof SessionConfigGroupIdSchema>;
const SessionConfigSelectGroupSchema = z.looseObject({
  group: SessionConfigGroupIdSchema,
  name: z.string(),
  options: z.array(SessionConfigSelectOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SessionConfigSelectGroupOutboundSchema = z.strictObject({
  group: SessionConfigGroupIdOutboundSchema,
  name: z.string(),
  options: z.array(SessionConfigSelectOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SessionConfigSelectGroup = z.output<typeof SessionConfigSelectGroupSchema>;
const SessionConfigSelectOptionsSchema = z.union([
  z.array(SessionConfigSelectOptionSchema),
  z.array(SessionConfigSelectGroupSchema),
]);
const SessionConfigSelectOptionsOutboundSchema = z.union([
  z.array(SessionConfigSelectOptionOutboundSchema),
  z.array(SessionConfigSelectGroupOutboundSchema),
]);
type SessionConfigSelectOptions = z.output<typeof SessionConfigSelectOptionsSchema>;
const SessionConfigSelectSchema = z.looseObject({
  currentValue: SessionConfigValueIdSchema,
  options: SessionConfigSelectOptionsSchema,
});
const SessionConfigSelectOutboundSchema = z.strictObject({
  currentValue: SessionConfigValueIdOutboundSchema,
  options: SessionConfigSelectOptionsOutboundSchema,
});
type SessionConfigSelect = z.output<typeof SessionConfigSelectSchema>;
const SessionConfigBooleanSchema = z.looseObject({ currentValue: z.boolean() });
const SessionConfigBooleanOutboundSchema = z.strictObject({ currentValue: z.boolean() });
type SessionConfigBoolean = z.output<typeof SessionConfigBooleanSchema>;
const SessionConfigOptionSchema = z.union([
  z.looseObject({
    currentValue: SessionConfigValueIdSchema,
    options: SessionConfigSelectOptionsSchema,
    type: z.literal("select"),
    id: SessionConfigIdSchema,
    name: z.string(),
    description: z.union([z.string(), z.null()]).optional(),
    category: z.union([SessionConfigOptionCategorySchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.looseObject({
    currentValue: z.boolean(),
    type: z.literal("boolean"),
    id: SessionConfigIdSchema,
    name: z.string(),
    description: z.union([z.string(), z.null()]).optional(),
    category: z.union([SessionConfigOptionCategorySchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
const SessionConfigOptionOutboundSchema = z.union([
  z.strictObject({
    currentValue: SessionConfigValueIdOutboundSchema,
    options: SessionConfigSelectOptionsOutboundSchema,
    type: z.literal("select"),
    id: SessionConfigIdOutboundSchema,
    name: z.string(),
    description: z.union([z.string(), z.null()]).optional(),
    category: z.union([SessionConfigOptionCategoryOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
  z.strictObject({
    currentValue: z.boolean(),
    type: z.literal("boolean"),
    id: SessionConfigIdOutboundSchema,
    name: z.string(),
    description: z.union([z.string(), z.null()]).optional(),
    category: z.union([SessionConfigOptionCategoryOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
  }),
]);
type SessionConfigOption = z.output<typeof SessionConfigOptionSchema>;
const NewSessionResponseSchema = z.looseObject({
  sessionId: SessionIdSchema,
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const NewSessionResponseOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type NewSessionResponse = z.output<typeof NewSessionResponseSchema>;
const LoadSessionResponseSchema = z.looseObject({
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const LoadSessionResponseOutboundSchema = z.strictObject({
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type LoadSessionResponse = z.output<typeof LoadSessionResponseSchema>;
export {
  ProviderInfoSchema,
  ProviderInfoOutboundSchema,
  type ProviderInfo,
  ListProvidersResponseSchema,
  ListProvidersResponseOutboundSchema,
  type ListProvidersResponse,
  SetProviderResponseSchema,
  SetProviderResponseOutboundSchema,
  type SetProviderResponse,
  DisableProviderResponseSchema,
  DisableProviderResponseOutboundSchema,
  type DisableProviderResponse,
  LogoutResponseSchema,
  LogoutResponseOutboundSchema,
  type LogoutResponse,
  SessionModeIdSchema,
  SessionModeIdOutboundSchema,
  type SessionModeId,
  SessionModeSchema,
  SessionModeOutboundSchema,
  type SessionMode,
  SessionModeStateSchema,
  SessionModeStateOutboundSchema,
  type SessionModeState,
  SessionConfigIdSchema,
  SessionConfigIdOutboundSchema,
  type SessionConfigId,
  SessionConfigOptionCategorySchema,
  SessionConfigOptionCategoryOutboundSchema,
  type SessionConfigOptionCategory,
  SessionConfigValueIdSchema,
  SessionConfigValueIdOutboundSchema,
  type SessionConfigValueId,
  SessionConfigSelectOptionSchema,
  SessionConfigSelectOptionOutboundSchema,
  type SessionConfigSelectOption,
  SessionConfigGroupIdSchema,
  SessionConfigGroupIdOutboundSchema,
  type SessionConfigGroupId,
  SessionConfigSelectGroupSchema,
  SessionConfigSelectGroupOutboundSchema,
  type SessionConfigSelectGroup,
  SessionConfigSelectOptionsSchema,
  SessionConfigSelectOptionsOutboundSchema,
  type SessionConfigSelectOptions,
  SessionConfigSelectSchema,
  SessionConfigSelectOutboundSchema,
  type SessionConfigSelect,
  SessionConfigBooleanSchema,
  SessionConfigBooleanOutboundSchema,
  type SessionConfigBoolean,
  SessionConfigOptionSchema,
  SessionConfigOptionOutboundSchema,
  type SessionConfigOption,
  NewSessionResponseSchema,
  NewSessionResponseOutboundSchema,
  type NewSessionResponse,
  LoadSessionResponseSchema,
  LoadSessionResponseOutboundSchema,
  type LoadSessionResponse,
};
