// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import {
  ProviderIdSchema,
  ProviderIdOutboundSchema,
  LlmProtocolSchema,
  LlmProtocolOutboundSchema,
  ProviderCurrentConfigSchema,
  ProviderCurrentConfigOutboundSchema,
} from "./schemas-4";

export const ProviderInfoSchema = z.looseObject({
  providerId: ProviderIdSchema,
  supported: z.array(LlmProtocolSchema),
  required: z.boolean(),
  current: z.union([ProviderCurrentConfigSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ProviderInfoOutboundSchema = z.strictObject({
  providerId: ProviderIdOutboundSchema,
  supported: z.array(LlmProtocolOutboundSchema),
  required: z.boolean(),
  current: z.union([ProviderCurrentConfigOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ProviderInfo = z.output<typeof ProviderInfoSchema>;

export const ListProvidersResponseSchema = z.looseObject({
  providers: z.array(ProviderInfoSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ListProvidersResponseOutboundSchema = z.strictObject({
  providers: z.array(ProviderInfoOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ListProvidersResponse = z.output<typeof ListProvidersResponseSchema>;

export const SetProviderResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SetProviderResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SetProviderResponse = z.output<typeof SetProviderResponseSchema>;

export const DisableProviderResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DisableProviderResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DisableProviderResponse = z.output<typeof DisableProviderResponseSchema>;

export const LogoutResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const LogoutResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type LogoutResponse = z.output<typeof LogoutResponseSchema>;

export const SessionModeIdSchema = z.string();

export const SessionModeIdOutboundSchema = z.string();

export type SessionModeId = z.output<typeof SessionModeIdSchema>;

export const SessionModeSchema = z.looseObject({
  id: SessionModeIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionModeOutboundSchema = z.strictObject({
  id: SessionModeIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionMode = z.output<typeof SessionModeSchema>;

export const SessionModeStateSchema = z.looseObject({
  currentModeId: SessionModeIdSchema,
  availableModes: z.array(SessionModeSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionModeStateOutboundSchema = z.strictObject({
  currentModeId: SessionModeIdOutboundSchema,
  availableModes: z.array(SessionModeOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionModeState = z.output<typeof SessionModeStateSchema>;

export const SessionConfigIdSchema = z.string();

export const SessionConfigIdOutboundSchema = z.string();

export type SessionConfigId = z.output<typeof SessionConfigIdSchema>;

export const SessionConfigOptionCategorySchema = z.union([
  z.literal("mode"),
  z.literal("model"),
  z.literal("model_config"),
  z.literal("thought_level"),
  z.string(),
]);

export const SessionConfigOptionCategoryOutboundSchema = z.union([
  z.literal("mode"),
  z.literal("model"),
  z.literal("model_config"),
  z.literal("thought_level"),
  z.string(),
]);

export type SessionConfigOptionCategory = z.output<typeof SessionConfigOptionCategorySchema>;

export const SessionConfigValueIdSchema = z.string();

export const SessionConfigValueIdOutboundSchema = z.string();

export type SessionConfigValueId = z.output<typeof SessionConfigValueIdSchema>;

export const SessionConfigSelectOptionSchema = z.looseObject({
  value: SessionConfigValueIdSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionConfigSelectOptionOutboundSchema = z.strictObject({
  value: SessionConfigValueIdOutboundSchema,
  name: z.string(),
  description: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionConfigSelectOption = z.output<typeof SessionConfigSelectOptionSchema>;

export const SessionConfigGroupIdSchema = z.string();

export const SessionConfigGroupIdOutboundSchema = z.string();

export type SessionConfigGroupId = z.output<typeof SessionConfigGroupIdSchema>;

export const SessionConfigSelectGroupSchema = z.looseObject({
  group: SessionConfigGroupIdSchema,
  name: z.string(),
  options: z.array(SessionConfigSelectOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionConfigSelectGroupOutboundSchema = z.strictObject({
  group: SessionConfigGroupIdOutboundSchema,
  name: z.string(),
  options: z.array(SessionConfigSelectOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionConfigSelectGroup = z.output<typeof SessionConfigSelectGroupSchema>;

export const SessionConfigSelectOptionsSchema = z.union([
  z.array(SessionConfigSelectOptionSchema),
  z.array(SessionConfigSelectGroupSchema),
]);

export const SessionConfigSelectOptionsOutboundSchema = z.union([
  z.array(SessionConfigSelectOptionOutboundSchema),
  z.array(SessionConfigSelectGroupOutboundSchema),
]);

export type SessionConfigSelectOptions = z.output<typeof SessionConfigSelectOptionsSchema>;

export const SessionConfigSelectSchema = z.looseObject({
  currentValue: SessionConfigValueIdSchema,
  options: SessionConfigSelectOptionsSchema,
});

export const SessionConfigSelectOutboundSchema = z.strictObject({
  currentValue: SessionConfigValueIdOutboundSchema,
  options: SessionConfigSelectOptionsOutboundSchema,
});

export type SessionConfigSelect = z.output<typeof SessionConfigSelectSchema>;

export const SessionConfigBooleanSchema = z.looseObject({ currentValue: z.boolean() });

export const SessionConfigBooleanOutboundSchema = z.strictObject({ currentValue: z.boolean() });

export type SessionConfigBoolean = z.output<typeof SessionConfigBooleanSchema>;

export const SessionConfigOptionSchema = z.union([
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

export const SessionConfigOptionOutboundSchema = z.union([
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

export type SessionConfigOption = z.output<typeof SessionConfigOptionSchema>;

export const NewSessionResponseSchema = z.looseObject({
  sessionId: SessionIdSchema,
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NewSessionResponseOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NewSessionResponse = z.output<typeof NewSessionResponseSchema>;

export const LoadSessionResponseSchema = z.looseObject({
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const LoadSessionResponseOutboundSchema = z.strictObject({
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type LoadSessionResponse = z.output<typeof LoadSessionResponseSchema>;
