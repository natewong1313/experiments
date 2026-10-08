// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import {
  RequestIdSchema,
  RequestIdOutboundSchema,
  ToolCallIdSchema,
  ToolCallIdOutboundSchema,
  ToolKindSchema,
  ToolKindOutboundSchema,
  ToolCallStatusSchema,
  ToolCallStatusOutboundSchema,
  ContentBlockSchema,
  ContentBlockOutboundSchema,
} from "./schemas-0";
import {
  ToolCallContentSchema,
  ToolCallContentOutboundSchema,
  ToolCallLocationSchema,
  ToolCallLocationOutboundSchema,
} from "./schemas-1";
import {
  InitializeResponseSchema,
  InitializeResponseOutboundSchema,
  AuthenticateResponseSchema,
  AuthenticateResponseOutboundSchema,
} from "./schemas-4";
import {
  ListProvidersResponseSchema,
  ListProvidersResponseOutboundSchema,
  SetProviderResponseSchema,
  SetProviderResponseOutboundSchema,
  DisableProviderResponseSchema,
  DisableProviderResponseOutboundSchema,
  LogoutResponseSchema,
  LogoutResponseOutboundSchema,
  NewSessionResponseSchema,
  NewSessionResponseOutboundSchema,
  LoadSessionResponseSchema,
  LoadSessionResponseOutboundSchema,
} from "./schemas-5";
import {
  ListSessionsResponseSchema,
  ListSessionsResponseOutboundSchema,
  DeleteSessionResponseSchema,
  DeleteSessionResponseOutboundSchema,
  ForkSessionResponseSchema,
  ForkSessionResponseOutboundSchema,
  ResumeSessionResponseSchema,
  ResumeSessionResponseOutboundSchema,
  CloseSessionResponseSchema,
  CloseSessionResponseOutboundSchema,
  SetSessionModeResponseSchema,
  SetSessionModeResponseOutboundSchema,
  SetSessionConfigOptionResponseSchema,
  SetSessionConfigOptionResponseOutboundSchema,
  PromptResponseSchema,
  PromptResponseOutboundSchema,
  StartNesResponseSchema,
  StartNesResponseOutboundSchema,
  NesSuggestionIdSchema,
  NesSuggestionIdOutboundSchema,
  NesTextEditSchema,
  NesTextEditOutboundSchema,
  PositionSchema,
  PositionOutboundSchema,
} from "./schemas-6";

export const NesSuggestionSchema = z.union([
  z.looseObject({
    id: NesSuggestionIdSchema,
    uri: z.string(),
    edits: z.array(NesTextEditSchema),
    cursorPosition: z.union([PositionSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("edit"),
  }),
  z.looseObject({
    id: NesSuggestionIdSchema,
    uri: z.string(),
    position: PositionSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("jump"),
  }),
  z.looseObject({
    id: NesSuggestionIdSchema,
    uri: z.string(),
    position: PositionSchema,
    newName: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("rename"),
  }),
  z.looseObject({
    id: NesSuggestionIdSchema,
    uri: z.string(),
    search: z.string(),
    replace: z.string(),
    isRegex: z.union([z.boolean(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("searchAndReplace"),
  }),
]);

export const NesSuggestionOutboundSchema = z.union([
  z.strictObject({
    id: NesSuggestionIdOutboundSchema,
    uri: z.string(),
    edits: z.array(NesTextEditOutboundSchema),
    cursorPosition: z.union([PositionOutboundSchema, z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("edit"),
  }),
  z.strictObject({
    id: NesSuggestionIdOutboundSchema,
    uri: z.string(),
    position: PositionOutboundSchema,
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("jump"),
  }),
  z.strictObject({
    id: NesSuggestionIdOutboundSchema,
    uri: z.string(),
    position: PositionOutboundSchema,
    newName: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("rename"),
  }),
  z.strictObject({
    id: NesSuggestionIdOutboundSchema,
    uri: z.string(),
    search: z.string(),
    replace: z.string(),
    isRegex: z.union([z.boolean(), z.null()]).optional(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    kind: z.literal("searchAndReplace"),
  }),
]);

export type NesSuggestion = z.output<typeof NesSuggestionSchema>;

export const SuggestNesResponseSchema = z.looseObject({
  suggestions: z.array(NesSuggestionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SuggestNesResponseOutboundSchema = z.strictObject({
  suggestions: z.array(NesSuggestionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SuggestNesResponse = z.output<typeof SuggestNesResponseSchema>;

export const CloseNesResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CloseNesResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CloseNesResponse = z.output<typeof CloseNesResponseSchema>;

export const ExtResponseSchema = z.unknown();

export const ExtResponseOutboundSchema = z.unknown();

export type ExtResponse = z.output<typeof ExtResponseSchema>;

export const ErrorCodeSchema = z.union([
  z.literal(-32700),
  z.literal(-32600),
  z.literal(-32601),
  z.literal(-32602),
  z.literal(-32603),
  z.literal(-32800),
  z.literal(-32000),
  z.literal(-32002),
  z.number().refine(Number.isInteger, { error: "Expected integer" }),
]);

export const ErrorCodeOutboundSchema = z.union([
  z.literal(-32700),
  z.literal(-32600),
  z.literal(-32601),
  z.literal(-32602),
  z.literal(-32603),
  z.literal(-32800),
  z.literal(-32000),
  z.literal(-32002),
  z.number().refine(Number.isInteger, { error: "Expected integer" }),
]);

export type ErrorCode = z.output<typeof ErrorCodeSchema>;

export const ErrorSchema = z.looseObject({
  code: ErrorCodeSchema,
  message: z.string(),
  data: z.unknown().optional(),
});

export const ErrorOutboundSchema = z.strictObject({
  code: ErrorCodeOutboundSchema,
  message: z.string(),
  data: z.unknown().optional(),
});

export type Error = z.output<typeof ErrorSchema>;

export const AgentResponseSchema = z.union([
  z.looseObject({
    id: RequestIdSchema,
    result: z.union([
      InitializeResponseSchema,
      AuthenticateResponseSchema,
      ListProvidersResponseSchema,
      SetProviderResponseSchema,
      DisableProviderResponseSchema,
      LogoutResponseSchema,
      NewSessionResponseSchema,
      LoadSessionResponseSchema,
      ListSessionsResponseSchema,
      DeleteSessionResponseSchema,
      ForkSessionResponseSchema,
      ResumeSessionResponseSchema,
      CloseSessionResponseSchema,
      SetSessionModeResponseSchema,
      SetSessionConfigOptionResponseSchema,
      PromptResponseSchema,
      StartNesResponseSchema,
      SuggestNesResponseSchema,
      CloseNesResponseSchema,
      ExtResponseSchema,
    ]),
  }),
  z.looseObject({ id: RequestIdSchema, error: ErrorSchema }),
]);

export const AgentResponseOutboundSchema = z.union([
  z.strictObject({
    id: RequestIdOutboundSchema,
    result: z.union([
      InitializeResponseOutboundSchema,
      AuthenticateResponseOutboundSchema,
      ListProvidersResponseOutboundSchema,
      SetProviderResponseOutboundSchema,
      DisableProviderResponseOutboundSchema,
      LogoutResponseOutboundSchema,
      NewSessionResponseOutboundSchema,
      LoadSessionResponseOutboundSchema,
      ListSessionsResponseOutboundSchema,
      DeleteSessionResponseOutboundSchema,
      ForkSessionResponseOutboundSchema,
      ResumeSessionResponseOutboundSchema,
      CloseSessionResponseOutboundSchema,
      SetSessionModeResponseOutboundSchema,
      SetSessionConfigOptionResponseOutboundSchema,
      PromptResponseOutboundSchema,
      StartNesResponseOutboundSchema,
      SuggestNesResponseOutboundSchema,
      CloseNesResponseOutboundSchema,
      ExtResponseOutboundSchema,
    ]),
  }),
  z.strictObject({ id: RequestIdOutboundSchema, error: ErrorOutboundSchema }),
]);

export type AgentResponse = z.output<typeof AgentResponseSchema>;

export const MessageIdSchema = z.string();

export const MessageIdOutboundSchema = z.string();

export type MessageId = z.output<typeof MessageIdSchema>;

export const ContentChunkSchema = z.looseObject({
  content: ContentBlockSchema,
  messageId: z.union([MessageIdSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ContentChunkOutboundSchema = z.strictObject({
  content: ContentBlockOutboundSchema,
  messageId: z.union([MessageIdOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ContentChunk = z.output<typeof ContentChunkSchema>;

export const ToolCallSchema = z.looseObject({
  toolCallId: ToolCallIdSchema,
  title: z.string(),
  name: z.union([z.string(), z.null()]).optional(),
  kind: ToolKindSchema.optional(),
  status: ToolCallStatusSchema.optional(),
  content: z.array(ToolCallContentSchema).optional(),
  locations: z.array(ToolCallLocationSchema).optional(),
  rawInput: z.unknown().optional(),
  rawOutput: z.unknown().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ToolCallOutboundSchema = z.strictObject({
  toolCallId: ToolCallIdOutboundSchema,
  title: z.string(),
  name: z.union([z.string(), z.null()]).optional(),
  kind: ToolKindOutboundSchema.optional(),
  status: ToolCallStatusOutboundSchema.optional(),
  content: z.array(ToolCallContentOutboundSchema).optional(),
  locations: z.array(ToolCallLocationOutboundSchema).optional(),
  rawInput: z.unknown().optional(),
  rawOutput: z.unknown().optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ToolCall = z.output<typeof ToolCallSchema>;

export const PlanEntryPrioritySchema = z.enum(["high", "medium", "low"]);

export const PlanEntryPriorityOutboundSchema = z.enum(["high", "medium", "low"]);

export type PlanEntryPriority = z.output<typeof PlanEntryPrioritySchema>;

export const PlanEntryStatusSchema = z.enum(["pending", "in_progress", "completed"]);

export const PlanEntryStatusOutboundSchema = z.enum(["pending", "in_progress", "completed"]);

export type PlanEntryStatus = z.output<typeof PlanEntryStatusSchema>;

export const PlanEntrySchema = z.looseObject({
  content: z.string(),
  priority: PlanEntryPrioritySchema,
  status: PlanEntryStatusSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanEntryOutboundSchema = z.strictObject({
  content: z.string(),
  priority: PlanEntryPriorityOutboundSchema,
  status: PlanEntryStatusOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PlanEntry = z.output<typeof PlanEntrySchema>;

export const PlanSchema = z.looseObject({
  entries: z.array(PlanEntrySchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanOutboundSchema = z.strictObject({
  entries: z.array(PlanEntryOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Plan = z.output<typeof PlanSchema>;

export const PlanIdSchema = z.string();

export const PlanIdOutboundSchema = z.string();

export type PlanId = z.output<typeof PlanIdSchema>;

export const PlanItemsSchema = z.looseObject({
  planId: PlanIdSchema,
  entries: z.array(PlanEntrySchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanItemsOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  entries: z.array(PlanEntryOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PlanItems = z.output<typeof PlanItemsSchema>;

export const PlanFileSchema = z.looseObject({
  planId: PlanIdSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanFileOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PlanFile = z.output<typeof PlanFileSchema>;

export const PlanMarkdownSchema = z.looseObject({
  planId: PlanIdSchema,
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanMarkdownOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PlanMarkdown = z.output<typeof PlanMarkdownSchema>;

export const PlanUpdateContentSchema = z.union([
  z.looseObject({
    planId: PlanIdSchema,
    entries: z.array(PlanEntrySchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("items"),
  }),
  z.looseObject({
    planId: PlanIdSchema,
    uri: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("file"),
  }),
  z.looseObject({
    planId: PlanIdSchema,
    content: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("markdown"),
  }),
]);

export const PlanUpdateContentOutboundSchema = z.union([
  z.strictObject({
    planId: PlanIdOutboundSchema,
    entries: z.array(PlanEntryOutboundSchema),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("items"),
  }),
  z.strictObject({
    planId: PlanIdOutboundSchema,
    uri: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("file"),
  }),
  z.strictObject({
    planId: PlanIdOutboundSchema,
    content: z.string(),
    _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
    type: z.literal("markdown"),
  }),
]);

export type PlanUpdateContent = z.output<typeof PlanUpdateContentSchema>;

export const PlanUpdateSchema = z.looseObject({
  plan: PlanUpdateContentSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PlanUpdateOutboundSchema = z.strictObject({
  plan: PlanUpdateContentOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PlanUpdate = z.output<typeof PlanUpdateSchema>;
