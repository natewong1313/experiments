import * as z from "zod";
import { ErrorInfoSchema, uriSchema } from "../../common";
import {
  CustomizationEnablementSchema,
  CustomizationSchema,
  McpServerStateSchema,
  ToolDefinitionSchema,
} from "../../primitives";
import { ChatSummarySchema } from "../chat/state";
import { ChangesetSchema } from "../changeset";
import { SessionActiveClientSchema, SessionInputRequestSchema } from "./state";

export const SessionActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("session/ready") }),
  z.strictObject({
    type: z.literal("session/creationFailed"),
    error: ErrorInfoSchema,
  }),
  z.strictObject({
    type: z.literal("session/chatAdded"),
    summary: ChatSummarySchema,
  }),
  z.strictObject({ type: z.literal("session/chatRemoved"), chat: uriSchema }),
  z.strictObject({
    type: z.literal("session/chatUpdated"),
    chat: uriSchema,
    changes: ChatSummarySchema.partial(),
  }),
  z.strictObject({
    type: z.literal("session/defaultChatChanged"),
    defaultChat: uriSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("session/titleChanged"),
    title: z.string(),
  }),
  z.strictObject({
    type: z.literal("session/isReadChanged"),
    isRead: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("session/isArchivedChanged"),
    isArchived: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("session/activityChanged"),
    activity: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("session/changesetsChanged"),
    changesets: z.array(ChangesetSchema).optional(),
  }),
  z.strictObject({
    type: z.literal("session/serverToolsChanged"),
    tools: z.array(ToolDefinitionSchema),
  }),
  z.strictObject({
    type: z.literal("session/activeClientSet"),
    activeClient: SessionActiveClientSchema,
  }),
  z.strictObject({
    type: z.literal("session/activeClientRemoved"),
    clientId: z.string(),
  }),
  z.strictObject({
    type: z.literal("session/workingDirectorySet"),
    directory: uriSchema,
  }),
  z.strictObject({
    type: z.literal("session/workingDirectoryRemoved"),
    directory: uriSchema,
  }),
  z.strictObject({
    type: z.literal("session/workingDirectoryReplaced"),
    directory: uriSchema,
    replacement: uriSchema,
  }),
  z.strictObject({
    type: z.literal("session/inputNeededSet"),
    request: SessionInputRequestSchema,
  }),
  z.strictObject({
    type: z.literal("session/inputNeededRemoved"),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("session/customizationsChanged"),
    customizations: z.array(CustomizationSchema),
  }),
  z.strictObject({
    type: z.literal("session/customizationToggled"),
    id: z.string(),
    enablement: z.array(CustomizationEnablementSchema),
  }),
  z.strictObject({
    type: z.literal("session/customizationUpdated"),
    customization: CustomizationSchema,
  }),
  z.strictObject({
    type: z.literal("session/customizationRemoved"),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("session/mcpServerStateChanged"),
    id: z.string(),
    state: McpServerStateSchema,
    channel: uriSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("session/mcpServerStartRequested"),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("session/mcpServerStopRequested"),
    id: z.string(),
  }),
  z.strictObject({
    type: z.literal("session/configChanged"),
    config: z.record(z.string(), z.unknown()),
    replace: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("session/metaChanged"),
    _meta: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export type SessionAction = z.output<typeof SessionActionSchema>;
