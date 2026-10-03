// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { RequestIdSchema, RequestIdOutboundSchema } from "./schemas-0";
import { ToolCallIdSchema, ToolCallIdOutboundSchema } from "./schemas-0";
import { ToolKindSchema, ToolKindOutboundSchema } from "./schemas-0";
import { ToolCallStatusSchema, ToolCallStatusOutboundSchema } from "./schemas-0";
import { ToolCallContentSchema, ToolCallContentOutboundSchema } from "./schemas-1";
import { ContentBlockSchema, ContentBlockOutboundSchema } from "./schemas-0";
import { ToolCallLocationSchema, ToolCallLocationOutboundSchema } from "./schemas-1";
import { InitializeResponseSchema, InitializeResponseOutboundSchema } from "./schemas-4";
import { AuthenticateResponseSchema, AuthenticateResponseOutboundSchema } from "./schemas-4";
import { ListProvidersResponseSchema, ListProvidersResponseOutboundSchema } from "./schemas-5";
import { SetProviderResponseSchema, SetProviderResponseOutboundSchema } from "./schemas-5";
import { DisableProviderResponseSchema, DisableProviderResponseOutboundSchema } from "./schemas-5";
import { LogoutResponseSchema, LogoutResponseOutboundSchema } from "./schemas-5";
import { NewSessionResponseSchema, NewSessionResponseOutboundSchema } from "./schemas-5";
import { LoadSessionResponseSchema, LoadSessionResponseOutboundSchema } from "./schemas-5";
import { ListSessionsResponseSchema, ListSessionsResponseOutboundSchema } from "./schemas-6";
import { DeleteSessionResponseSchema, DeleteSessionResponseOutboundSchema } from "./schemas-6";
import { ForkSessionResponseSchema, ForkSessionResponseOutboundSchema } from "./schemas-6";
import { ResumeSessionResponseSchema, ResumeSessionResponseOutboundSchema } from "./schemas-6";
import { CloseSessionResponseSchema, CloseSessionResponseOutboundSchema } from "./schemas-6";
import { SetSessionModeResponseSchema, SetSessionModeResponseOutboundSchema } from "./schemas-6";
import {
  SetSessionConfigOptionResponseSchema,
  SetSessionConfigOptionResponseOutboundSchema,
} from "./schemas-6";
import { PromptResponseSchema, PromptResponseOutboundSchema } from "./schemas-6";
import { StartNesResponseSchema, StartNesResponseOutboundSchema } from "./schemas-6";
import { NesSuggestionIdSchema, NesSuggestionIdOutboundSchema } from "./schemas-6";
import { NesTextEditSchema, NesTextEditOutboundSchema } from "./schemas-6";
import { PositionSchema, PositionOutboundSchema } from "./schemas-6";
const NesSuggestionSchema = z.union([
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
const NesSuggestionOutboundSchema = z.union([
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
type NesSuggestion = z.output<typeof NesSuggestionSchema>;
const SuggestNesResponseSchema = z.looseObject({
  suggestions: z.array(NesSuggestionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const SuggestNesResponseOutboundSchema = z.strictObject({
  suggestions: z.array(NesSuggestionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type SuggestNesResponse = z.output<typeof SuggestNesResponseSchema>;
const CloseNesResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const CloseNesResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type CloseNesResponse = z.output<typeof CloseNesResponseSchema>;
const ExtResponseSchema = z.unknown();
const ExtResponseOutboundSchema = z.unknown();
type ExtResponse = z.output<typeof ExtResponseSchema>;
const ErrorCodeSchema = z.union([
  z.literal(-32700),
  z.literal(-32600),
  z.literal(-32601),
  z.literal(-32602),
  z.literal(-32603),
  z.literal(-32800),
  z.literal(-32000),
  z.literal(-32002),
  z.number().refine(Number.isInteger, { message: "Expected integer" }),
]);
const ErrorCodeOutboundSchema = z.union([
  z.literal(-32700),
  z.literal(-32600),
  z.literal(-32601),
  z.literal(-32602),
  z.literal(-32603),
  z.literal(-32800),
  z.literal(-32000),
  z.literal(-32002),
  z.number().refine(Number.isInteger, { message: "Expected integer" }),
]);
type ErrorCode = z.output<typeof ErrorCodeSchema>;
const ErrorSchema = z.looseObject({
  code: ErrorCodeSchema,
  message: z.string(),
  data: z.unknown().optional(),
});
const ErrorOutboundSchema = z.strictObject({
  code: ErrorCodeOutboundSchema,
  message: z.string(),
  data: z.unknown().optional(),
});
type Error = z.output<typeof ErrorSchema>;
const AgentResponseSchema = z.union([
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
const AgentResponseOutboundSchema = z.union([
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
type AgentResponse = z.output<typeof AgentResponseSchema>;
const MessageIdSchema = z.string();
const MessageIdOutboundSchema = z.string();
type MessageId = z.output<typeof MessageIdSchema>;
const ContentChunkSchema = z.looseObject({
  content: ContentBlockSchema,
  messageId: z.union([MessageIdSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const ContentChunkOutboundSchema = z.strictObject({
  content: ContentBlockOutboundSchema,
  messageId: z.union([MessageIdOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type ContentChunk = z.output<typeof ContentChunkSchema>;
const ToolCallSchema = z.looseObject({
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
const ToolCallOutboundSchema = z.strictObject({
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
type ToolCall = z.output<typeof ToolCallSchema>;
const PlanEntryPrioritySchema = z.union([z.literal("high"), z.literal("medium"), z.literal("low")]);
const PlanEntryPriorityOutboundSchema = z.union([
  z.literal("high"),
  z.literal("medium"),
  z.literal("low"),
]);
type PlanEntryPriority = z.output<typeof PlanEntryPrioritySchema>;
const PlanEntryStatusSchema = z.union([
  z.literal("pending"),
  z.literal("in_progress"),
  z.literal("completed"),
]);
const PlanEntryStatusOutboundSchema = z.union([
  z.literal("pending"),
  z.literal("in_progress"),
  z.literal("completed"),
]);
type PlanEntryStatus = z.output<typeof PlanEntryStatusSchema>;
const PlanEntrySchema = z.looseObject({
  content: z.string(),
  priority: PlanEntryPrioritySchema,
  status: PlanEntryStatusSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanEntryOutboundSchema = z.strictObject({
  content: z.string(),
  priority: PlanEntryPriorityOutboundSchema,
  status: PlanEntryStatusOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PlanEntry = z.output<typeof PlanEntrySchema>;
const PlanSchema = z.looseObject({
  entries: z.array(PlanEntrySchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanOutboundSchema = z.strictObject({
  entries: z.array(PlanEntryOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type Plan = z.output<typeof PlanSchema>;
const PlanIdSchema = z.string();
const PlanIdOutboundSchema = z.string();
type PlanId = z.output<typeof PlanIdSchema>;
const PlanItemsSchema = z.looseObject({
  planId: PlanIdSchema,
  entries: z.array(PlanEntrySchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanItemsOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  entries: z.array(PlanEntryOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PlanItems = z.output<typeof PlanItemsSchema>;
const PlanFileSchema = z.looseObject({
  planId: PlanIdSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanFileOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  uri: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PlanFile = z.output<typeof PlanFileSchema>;
const PlanMarkdownSchema = z.looseObject({
  planId: PlanIdSchema,
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanMarkdownOutboundSchema = z.strictObject({
  planId: PlanIdOutboundSchema,
  content: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PlanMarkdown = z.output<typeof PlanMarkdownSchema>;
const PlanUpdateContentSchema = z.union([
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
const PlanUpdateContentOutboundSchema = z.union([
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
type PlanUpdateContent = z.output<typeof PlanUpdateContentSchema>;
const PlanUpdateSchema = z.looseObject({
  plan: PlanUpdateContentSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
const PlanUpdateOutboundSchema = z.strictObject({
  plan: PlanUpdateContentOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});
type PlanUpdate = z.output<typeof PlanUpdateSchema>;
export {
  NesSuggestionSchema,
  NesSuggestionOutboundSchema,
  type NesSuggestion,
  SuggestNesResponseSchema,
  SuggestNesResponseOutboundSchema,
  type SuggestNesResponse,
  CloseNesResponseSchema,
  CloseNesResponseOutboundSchema,
  type CloseNesResponse,
  ExtResponseSchema,
  ExtResponseOutboundSchema,
  type ExtResponse,
  ErrorCodeSchema,
  ErrorCodeOutboundSchema,
  type ErrorCode,
  ErrorSchema,
  ErrorOutboundSchema,
  type Error,
  AgentResponseSchema,
  AgentResponseOutboundSchema,
  type AgentResponse,
  MessageIdSchema,
  MessageIdOutboundSchema,
  type MessageId,
  ContentChunkSchema,
  ContentChunkOutboundSchema,
  type ContentChunk,
  ToolCallSchema,
  ToolCallOutboundSchema,
  type ToolCall,
  PlanEntryPrioritySchema,
  PlanEntryPriorityOutboundSchema,
  type PlanEntryPriority,
  PlanEntryStatusSchema,
  PlanEntryStatusOutboundSchema,
  type PlanEntryStatus,
  PlanEntrySchema,
  PlanEntryOutboundSchema,
  type PlanEntry,
  PlanSchema,
  PlanOutboundSchema,
  type Plan,
  PlanIdSchema,
  PlanIdOutboundSchema,
  type PlanId,
  PlanItemsSchema,
  PlanItemsOutboundSchema,
  type PlanItems,
  PlanFileSchema,
  PlanFileOutboundSchema,
  type PlanFile,
  PlanMarkdownSchema,
  PlanMarkdownOutboundSchema,
  type PlanMarkdown,
  PlanUpdateContentSchema,
  PlanUpdateContentOutboundSchema,
  type PlanUpdateContent,
  PlanUpdateSchema,
  PlanUpdateOutboundSchema,
  type PlanUpdate,
};
