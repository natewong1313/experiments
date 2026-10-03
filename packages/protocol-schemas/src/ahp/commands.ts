import * as z from "zod";
import { clientIdSchema, metaSchema, seqSchema, uriSchema } from "./common";
import { TelemetryCapabilitiesSchema } from "./channels/otlp";
import { SnapshotSchema, ActionEnvelopeSchema, StateActionSchema } from "./envelope";
import { SessionActiveClientSchema, SessionSummarySchema } from "./channels/session/state";

const ROOT_CHANNEL = "ahp-root://";

const SESSION_CHANNEL_PREFIX = "ahp-session:/";

const MIN_SESSION_ID_LENGTH = 1;

const MIN_ADVISORY_VALUE = 0;

const ChannelParamsSchema = z.strictObject({
  channel: uriSchema,
  _meta: metaSchema.optional(),
});

const RootChannelParamsSchema = ChannelParamsSchema.extend({
  channel: z.literal(ROOT_CHANNEL),
});

const ImplementationSchema = z.strictObject({
  name: z.string(),
  version: z.string().optional(),
  title: z.string().optional(),
});

const ClientCapabilitiesSchema = z.strictObject({
  mcpApps: z.strictObject({}).optional(),
});

const InitializeParamsSchema = RootChannelParamsSchema.extend({
  clientId: clientIdSchema,
  protocolVersions: z.tuple([z.string()], z.string()),
  clientInfo: ImplementationSchema.optional(),
  initialSubscriptions: z.array(uriSchema).optional(),
  locale: z.string().optional(),
  capabilities: ClientCapabilitiesSchema.optional(),
});

const ReconnectParamsSchema = RootChannelParamsSchema.extend({
  clientId: clientIdSchema,
  lastSeenServerSeq: seqSchema,
  subscriptions: z.array(uriSchema),
});

const SubscriptionDeliveryOptionsSchema = z.strictObject({
  maxLatencyMs: z.number().min(MIN_ADVISORY_VALUE).optional(),
});

const SubscribeViewSchema = z.strictObject({
  turns: z.int().min(MIN_ADVISORY_VALUE).optional(),
});

const SubscribeParamsSchema = ChannelParamsSchema.extend({
  delivery: SubscriptionDeliveryOptionsSchema.optional(),
  view: SubscribeViewSchema.optional(),
});

const CreateSessionParamsSchema = ChannelParamsSchema.extend({
  channel: uriSchema
    .startsWith(SESSION_CHANNEL_PREFIX)
    .min(SESSION_CHANNEL_PREFIX.length + MIN_SESSION_ID_LENGTH),
  provider: z.string().optional(),
  workingDirectories: z.array(uriSchema).optional(),
  config: metaSchema.optional(),
  activeClient: SessionActiveClientSchema.optional(),
  progressToken: z.string().optional(),
});

const ListSessionsParamsSchema = RootChannelParamsSchema.extend({
  cursor: z.string().optional(),
  limit: z.int().positive().optional(),
});

const FetchTurnsParamsSchema = ChannelParamsSchema.extend({
  cursor: z.string().optional(),
});

const DispatchActionParamsSchema = ChannelParamsSchema.extend({
  clientSeq: seqSchema,
  action: StateActionSchema,
});

const AutomationCapabilitiesSchema = z.strictObject({
  create: z.strictObject({}).optional(),
  schedules: z.strictObject({ minIntervalMinutes: z.number().optional() }).optional(),
  runCancellation: z.strictObject({}).optional(),
  runHistoryLimit: z.number().optional(),
});

const InitializeResultSchema = z.strictObject({
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

const SubscribeResultSchema = z.strictObject({
  snapshot: SnapshotSchema.optional(),
});

const ReconnectResultSchema = z.discriminatedUnion("type", [
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

const ListSessionsResultSchema = z.strictObject({
  items: z.array(SessionSummarySchema),
  nextCursor: z.string().optional(),
});

const FetchTurnsResultSchema = z.strictObject({});

const ResourceReadResultSchema = z.strictObject({
  data: z.string(),
  encoding: z.enum(["base64", "utf-8"]),
  contentType: z.string().optional(),
});

const ResourceListResultSchema = z.strictObject({
  entries: z.array(
    z.strictObject({
      name: z.string(),
      type: z.enum(["file", "directory"]),
    }),
  ),
});

const ResourceResolveResultSchema = z.strictObject({
  uri: uriSchema,
  type: z.enum(["file", "directory", "symlink"]),
  size: z.number().optional(),
  mtime: z.string().optional(),
  ctime: z.string().optional(),
  contentType: z.string().optional(),
  etag: z.string().optional(),
});

const ResourceWriteResultSchema = z.strictObject({});

type Implementation = z.output<typeof ImplementationSchema>;

type ChannelParams = z.output<typeof ChannelParamsSchema>;

type RootChannelParams = z.output<typeof RootChannelParamsSchema>;

type ClientCapabilities = z.output<typeof ClientCapabilitiesSchema>;

type InitializeParams = z.output<typeof InitializeParamsSchema>;

type ReconnectParams = z.output<typeof ReconnectParamsSchema>;

type SubscriptionDeliveryOptions = z.output<typeof SubscriptionDeliveryOptionsSchema>;

type SubscribeView = z.output<typeof SubscribeViewSchema>;

type SubscribeParams = z.output<typeof SubscribeParamsSchema>;

type CreateSessionParams = z.output<typeof CreateSessionParamsSchema>;

type ListSessionsParams = z.output<typeof ListSessionsParamsSchema>;

type FetchTurnsParams = z.output<typeof FetchTurnsParamsSchema>;

type DispatchActionParams = z.output<typeof DispatchActionParamsSchema>;

type AutomationCapabilities = z.output<typeof AutomationCapabilitiesSchema>;

type InitializeResult = z.output<typeof InitializeResultSchema>;

type SubscribeResult = z.output<typeof SubscribeResultSchema>;

type ReconnectResult = z.output<typeof ReconnectResultSchema>;

type ListSessionsResult = z.output<typeof ListSessionsResultSchema>;

type FetchTurnsResult = z.output<typeof FetchTurnsResultSchema>;

type ResourceReadResult = z.output<typeof ResourceReadResultSchema>;

type ResourceListResult = z.output<typeof ResourceListResultSchema>;

type ResourceResolveResult = z.output<typeof ResourceResolveResultSchema>;

type ResourceWriteResult = z.output<typeof ResourceWriteResultSchema>;

export {
  ChannelParamsSchema,
  RootChannelParamsSchema,
  ClientCapabilitiesSchema,
  InitializeParamsSchema,
  ReconnectParamsSchema,
  SubscriptionDeliveryOptionsSchema,
  SubscribeViewSchema,
  SubscribeParamsSchema,
  CreateSessionParamsSchema,
  ListSessionsParamsSchema,
  FetchTurnsParamsSchema,
  DispatchActionParamsSchema,
  type ChannelParams,
  type RootChannelParams,
  type ClientCapabilities,
  type InitializeParams,
  type ReconnectParams,
  type SubscriptionDeliveryOptions,
  type SubscribeView,
  type SubscribeParams,
  type CreateSessionParams,
  type ListSessionsParams,
  type FetchTurnsParams,
  type DispatchActionParams,
  AutomationCapabilitiesSchema,
  FetchTurnsResultSchema,
  ImplementationSchema,
  InitializeResultSchema,
  ListSessionsResultSchema,
  ReconnectResultSchema,
  ResourceListResultSchema,
  ResourceReadResultSchema,
  ResourceResolveResultSchema,
  ResourceWriteResultSchema,
  SubscribeResultSchema,
  type AutomationCapabilities,
  type FetchTurnsResult,
  type Implementation,
  type InitializeResult,
  type ListSessionsResult,
  type ReconnectResult,
  type ResourceListResult,
  type ResourceReadResult,
  type ResourceResolveResult,
  type ResourceWriteResult,
  type SubscribeResult,
};
