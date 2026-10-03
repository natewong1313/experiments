import * as z from "zod";
import { ErrorInfoSchema, configPropertyFields, isoTimestampSchema, uriSchema } from "../../common";
import {
  ClientPluginCustomizationSchema,
  CustomizationSchema,
  ToolDefinitionSchema,
  sessionStatusSchema,
} from "../../primitives";
import { ChatSummarySchema } from "../chat/state";
import { ChatInputRequestSchema } from "../chat/input";
import {
  ToolCallAuthRequiredStateSchema,
  ToolCallPendingConfirmationStateSchema,
  ToolCallPendingResultConfirmationStateSchema,
  ToolCallRunningStateSchema,
} from "../chat/tool-call";
import { ChangesetSchema } from "../changeset";
import { AnnotationsSummarySchema } from "../annotations";

const SessionLifecycleSchema = z.enum(["creating", "ready", "failed"]);

const SessionMetadataSchema = z.strictObject({
  provider: z.string(),
  title: z.string(),
  status: sessionStatusSchema,
  activity: z.string().optional(),
  origin: z
    .discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("automation"),
        automation: uriSchema,
        run: uriSchema,
      }),
    ])
    .optional(),
  project: z
    .strictObject({
      uri: uriSchema,
      displayName: z.string(),
    })
    .optional(),
  workingDirectories: z.array(uriSchema).optional(),
  annotations: AnnotationsSummarySchema.optional(),
});

const ChangesSummarySchema = z.strictObject({
  additions: z.number().optional(),
  deletions: z.number().optional(),
  files: z.number().optional(),
});

const SessionSummarySchema = z.strictObject({
  ...SessionMetadataSchema.shape,
  resource: uriSchema,
  createdAt: isoTimestampSchema,
  modifiedAt: isoTimestampSchema,
  changes: ChangesSummarySchema.optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

const SessionConfigPropertySchema: z.ZodType<SessionConfigProperty> = z.lazy(() => {
  return z.strictObject({
    ...configPropertyFields,
    enumDynamic: z.boolean().optional(),
    sessionMutable: z.boolean().optional(),
    items: sessionConfigPropertySchemaLazy.optional(),
    properties: z.record(z.string(), sessionConfigPropertySchemaLazy).optional(),
    additionalProperties: sessionConfigPropertySchemaLazy.optional(),
  });
});

const sessionConfigPropertySchemaLazy = SessionConfigPropertySchema;

const SessionConfigSchemaSchema = z.strictObject({
  type: z.literal("object"),
  properties: z.record(z.string(), SessionConfigPropertySchema),
  required: z.array(z.string()).optional(),
});

const SessionConfigStateSchema = z.strictObject({
  schema: SessionConfigSchemaSchema,
  values: z.record(z.string(), z.unknown()),
});

const SessionActiveClientSchema = z.strictObject({
  clientId: z.string(),
  displayName: z.string().optional(),
  tools: z.array(ToolDefinitionSchema),
  customizations: z.array(ClientPluginCustomizationSchema).optional(),
});

const SessionInputRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("chatInput"),
    id: z.string(),
    chat: uriSchema,
    request: ChatInputRequestSchema,
  }),
  z.strictObject({
    kind: z.literal("toolConfirmation"),
    id: z.string(),
    chat: uriSchema,
    turnId: z.string(),
    toolCall: z.union([
      ToolCallPendingConfirmationStateSchema,
      ToolCallPendingResultConfirmationStateSchema,
    ]),
  }),
  z.strictObject({
    kind: z.literal("toolClientExecution"),
    id: z.string(),
    chat: uriSchema,
    turnId: z.string(),
    clientId: z.string(),
    toolCall: ToolCallRunningStateSchema,
  }),
  z.strictObject({
    kind: z.literal("toolAuthentication"),
    id: z.string(),
    chat: uriSchema,
    turnId: z.string(),
    toolCall: ToolCallAuthRequiredStateSchema,
  }),
]);

const SessionStateSchema = z.strictObject({
  ...SessionMetadataSchema.shape,
  lifecycle: SessionLifecycleSchema,
  creationError: ErrorInfoSchema.optional(),
  serverTools: z.array(ToolDefinitionSchema).optional(),
  activeClients: z.array(SessionActiveClientSchema),
  chats: z.array(ChatSummarySchema),
  defaultChat: uriSchema.optional(),
  config: SessionConfigStateSchema.optional(),
  customizations: z.array(CustomizationSchema).optional(),
  changesets: z.array(ChangesetSchema).optional(),
  inputNeeded: z.array(SessionInputRequestSchema).optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

type SessionLifecycle = z.output<typeof SessionLifecycleSchema>;

type SessionMetadata = z.output<typeof SessionMetadataSchema>;

type ChangesSummary = z.output<typeof ChangesSummarySchema>;

type SessionSummary = z.output<typeof SessionSummarySchema>;

type SessionConfigProperty = {
  type: "string" | "number" | "boolean" | "array" | "object";
  title: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  enumLabels?: string[];
  enumDescriptions?: string[];
  readOnly?: boolean;
  required?: string[];
  enumDynamic?: boolean;
  sessionMutable?: boolean;
  items?: SessionConfigProperty;
  properties?: Record<string, SessionConfigProperty>;
  additionalProperties?: SessionConfigProperty;
};

type SessionConfigSchema = z.output<typeof SessionConfigSchemaSchema>;

type SessionConfigState = z.output<typeof SessionConfigStateSchema>;

type SessionActiveClient = z.output<typeof SessionActiveClientSchema>;

type SessionInputRequest = z.output<typeof SessionInputRequestSchema>;

type SessionState = z.output<typeof SessionStateSchema>;

export {
  SessionActiveClientSchema,
  SessionConfigSchemaSchema,
  SessionConfigStateSchema,
  SessionInputRequestSchema,
  SessionLifecycleSchema,
  SessionMetadataSchema,
  SessionStateSchema,
  SessionSummarySchema,
  ChangesSummarySchema,
  type ChangesSummary,
  type SessionActiveClient,
  type SessionConfigProperty,
  type SessionConfigSchema,
  type SessionConfigState,
  type SessionInputRequest,
  type SessionLifecycle,
  type SessionMetadata,
  type SessionState,
  type SessionSummary,
};
