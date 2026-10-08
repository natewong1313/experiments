import * as z from "zod";
import { clientIdSchema, metaSchema, seqSchema, uriSchema } from "./common";
import { TelemetryCapabilitiesSchema } from "./channels/otlp";
import { SnapshotSchema, ActionEnvelopeSchema, StateActionSchema } from "./envelope";
import { SessionActiveClientSchema, SessionSummarySchema } from "./channels/session/state";

const ROOT_CHANNEL = "ahp-root://";
const SESSION_CHANNEL_PREFIX = "ahp-session:/";
const MIN_SESSION_ID_LENGTH = 1;
const MIN_ADVISORY_VALUE = 0;

export const ChannelParamsSchema = z.strictObject({
  channel: uriSchema,
  _meta: metaSchema.optional(),
});

export const RootChannelParamsSchema = ChannelParamsSchema.extend({
  channel: z.literal(ROOT_CHANNEL),
});

export const ImplementationSchema = z.strictObject({
  name: z.string(),
  version: z.string().optional(),
  title: z.string().optional(),
});

export const ClientCapabilitiesSchema = z.strictObject({
  mcpApps: z.strictObject({}).optional(),
});

export const InitializeParamsSchema = RootChannelParamsSchema.extend({
  clientId: clientIdSchema,
  protocolVersions: z.tuple([z.string()], z.string()),
  clientInfo: ImplementationSchema.optional(),
  initialSubscriptions: z.array(uriSchema).optional(),
  locale: z.string().optional(),
  capabilities: ClientCapabilitiesSchema.optional(),
});

export const ReconnectParamsSchema = RootChannelParamsSchema.extend({
  clientId: clientIdSchema,
  lastSeenServerSeq: seqSchema,
  subscriptions: z.array(uriSchema),
});

export const SubscriptionDeliveryOptionsSchema = z.strictObject({
  maxLatencyMs: z.number().min(MIN_ADVISORY_VALUE).optional(),
});

export const SubscribeViewSchema = z.strictObject({
  turns: z.int().min(MIN_ADVISORY_VALUE).optional(),
});

export const SubscribeParamsSchema = ChannelParamsSchema.extend({
  delivery: SubscriptionDeliveryOptionsSchema.optional(),
  view: SubscribeViewSchema.optional(),
});

export const CreateSessionParamsSchema = ChannelParamsSchema.extend({
  channel: uriSchema
    .startsWith(SESSION_CHANNEL_PREFIX)
    .min(SESSION_CHANNEL_PREFIX.length + MIN_SESSION_ID_LENGTH),
  provider: z.string().optional(),
  workingDirectories: z.array(uriSchema).optional(),
  config: metaSchema.optional(),
  activeClient: SessionActiveClientSchema.optional(),
  progressToken: z.string().optional(),
});

export const ListSessionsParamsSchema = RootChannelParamsSchema.extend({
  cursor: z.string().optional(),
  limit: z.int().positive().optional(),
});

export const FetchTurnsParamsSchema = ChannelParamsSchema.extend({
  cursor: z.string().optional(),
});

export const ResourceReadParamsSchema = RootChannelParamsSchema.extend({
  uri: uriSchema,
  encoding: z.enum(["base64", "utf-8"]).optional(),
});

export const DispatchActionParamsSchema = ChannelParamsSchema.extend({
  clientSeq: seqSchema,
  action: StateActionSchema,
});

export const AutomationCapabilitiesSchema = z.strictObject({
  create: z.strictObject({}).optional(),
  schedules: z.strictObject({ minIntervalMinutes: z.number().optional() }).optional(),
  runCancellation: z.strictObject({}).optional(),
  runHistoryLimit: z.number().optional(),
});

export const InitializeResultSchema = z.strictObject({
  protocolVersion: z.string(),
  serverSeq: seqSchema,
  serverInfo: ImplementationSchema.optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
  snapshots: z.array(SnapshotSchema),
  defaultDirectory: uriSchema.optional(),
  completionTriggerCharacters: z.array(z.string()).optional(),
  terminalCommandPrefix: z.string().optional(),
  telemetry: TelemetryCapabilitiesSchema.optional(),
  automations: AutomationCapabilitiesSchema.optional(),
});

export const SubscribeResultSchema = z.strictObject({
  snapshot: SnapshotSchema.optional(),
});

export const ReconnectResultSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("replay"),
    actions: z.array(ActionEnvelopeSchema),
    missing: z.array(uriSchema),
  }),
  z.strictObject({
    type: z.literal("snapshot"),
    snapshots: z.array(SnapshotSchema),
  }),
]);

export const ListSessionsResultSchema = z.strictObject({
  items: z.array(SessionSummarySchema),
  nextCursor: z.string().optional(),
});

export const FetchTurnsResultSchema = z.strictObject({});

export const ResourceReadResultSchema = z.strictObject({
  data: z.string(),
  encoding: z.enum(["base64", "utf-8"]),
  contentType: z.string().optional(),
});

export const ResourceListResultSchema = z.strictObject({
  entries: z.array(
    z.strictObject({
      name: z.string(),
      type: z.enum(["file", "directory"]),
    }),
  ),
});

export const ResourceResolveResultSchema = z.strictObject({
  uri: uriSchema,
  type: z.enum(["file", "directory", "symlink"]),
  size: z.number().optional(),
  mtime: z.string().optional(),
  ctime: z.string().optional(),
  contentType: z.string().optional(),
  etag: z.string().optional(),
});

export const ResourceWriteResultSchema = z.strictObject({});

export type Implementation = z.output<typeof ImplementationSchema>;

export type ChannelParams = z.output<typeof ChannelParamsSchema>;

export type RootChannelParams = z.output<typeof RootChannelParamsSchema>;

export type ClientCapabilities = z.output<typeof ClientCapabilitiesSchema>;

export type InitializeParams = z.output<typeof InitializeParamsSchema>;

export type ReconnectParams = z.output<typeof ReconnectParamsSchema>;

export type SubscriptionDeliveryOptions = z.output<typeof SubscriptionDeliveryOptionsSchema>;

export type SubscribeView = z.output<typeof SubscribeViewSchema>;

export type SubscribeParams = z.output<typeof SubscribeParamsSchema>;

export type CreateSessionParams = z.output<typeof CreateSessionParamsSchema>;

export type ListSessionsParams = z.output<typeof ListSessionsParamsSchema>;

export type FetchTurnsParams = z.output<typeof FetchTurnsParamsSchema>;

export type ResourceReadParams = z.output<typeof ResourceReadParamsSchema>;

export type DispatchActionParams = z.output<typeof DispatchActionParamsSchema>;

export type AutomationCapabilities = z.output<typeof AutomationCapabilitiesSchema>;

export type InitializeResult = z.output<typeof InitializeResultSchema>;

export type SubscribeResult = z.output<typeof SubscribeResultSchema>;

export type ReconnectResult = z.output<typeof ReconnectResultSchema>;

export type ListSessionsResult = z.output<typeof ListSessionsResultSchema>;

export type FetchTurnsResult = z.output<typeof FetchTurnsResultSchema>;

export type ResourceReadResult = z.output<typeof ResourceReadResultSchema>;

export type ResourceListResult = z.output<typeof ResourceListResultSchema>;

export type ResourceResolveResult = z.output<typeof ResourceResolveResultSchema>;

export type ResourceWriteResult = z.output<typeof ResourceWriteResultSchema>;
