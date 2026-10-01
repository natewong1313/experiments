import * as z from "zod";
import { seqSchema, uriSchema } from "./common";
import { TelemetryCapabilitiesSchema } from "./channels/otlp";
import { SnapshotSchema, ActionEnvelopeSchema } from "./envelope";
import { SessionSummarySchema } from "./channels/session/state";

const ImplementationSchema = z.strictObject({
  name: z.string(),
  version: z.string().optional(),
  title: z.string().optional(),
});

const AutomationCapabilitiesSchema = z.strictObject({
  create: z.strictObject({}).optional(),
  schedules: z
    .strictObject({ minIntervalMinutes: z.number().optional() })
    .optional(),
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
