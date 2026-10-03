// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import {
  SessionModeStateSchema,
  SessionModeStateOutboundSchema,
  SessionConfigOptionSchema,
  SessionConfigOptionOutboundSchema,
} from "./schemas-5";

const SessionInfoSchema = z.looseObject({
  sessionId: SessionIdSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const SessionInfoOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type SessionInfo = z.output<typeof SessionInfoSchema>;

const ListSessionsResponseSchema = z.looseObject({
  sessions: z.array(SessionInfoSchema),
  nextCursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ListSessionsResponseOutboundSchema = z.strictObject({
  sessions: z.array(SessionInfoOutboundSchema),
  nextCursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type ListSessionsResponse = z.output<typeof ListSessionsResponseSchema>;

const DeleteSessionResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const DeleteSessionResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type DeleteSessionResponse = z.output<typeof DeleteSessionResponseSchema>;

const ForkSessionResponseSchema = z.looseObject({
  sessionId: SessionIdSchema,
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ForkSessionResponseOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type ForkSessionResponse = z.output<typeof ForkSessionResponseSchema>;

const ResumeSessionResponseSchema = z.looseObject({
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const ResumeSessionResponseOutboundSchema = z.strictObject({
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type ResumeSessionResponse = z.output<typeof ResumeSessionResponseSchema>;

const CloseSessionResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const CloseSessionResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type CloseSessionResponse = z.output<typeof CloseSessionResponseSchema>;

const SetSessionModeResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const SetSessionModeResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type SetSessionModeResponse = z.output<typeof SetSessionModeResponseSchema>;

const SetSessionConfigOptionResponseSchema = z.looseObject({
  configOptions: z.array(SessionConfigOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const SetSessionConfigOptionResponseOutboundSchema = z.strictObject({
  configOptions: z.array(SessionConfigOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type SetSessionConfigOptionResponse = z.output<typeof SetSessionConfigOptionResponseSchema>;

const StopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);

const StopReasonOutboundSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);

type StopReason = z.output<typeof StopReasonSchema>;

const UsageSchema = z.looseObject({
  totalTokens: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  inputTokens: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  outputTokens: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  thoughtTokens: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  cachedReadTokens: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  cachedWriteTokens: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const UsageOutboundSchema = z.strictObject({
  totalTokens: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  inputTokens: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  outputTokens: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  thoughtTokens: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  cachedReadTokens: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  cachedWriteTokens: z
    .union([
      z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
      z.null(),
    ])
    .optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type Usage = z.output<typeof UsageSchema>;

const PromptResponseSchema = z.looseObject({
  stopReason: StopReasonSchema,
  usage: z.union([UsageSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const PromptResponseOutboundSchema = z.strictObject({
  stopReason: StopReasonOutboundSchema,
  usage: z.union([UsageOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type PromptResponse = z.output<typeof PromptResponseSchema>;

const StartNesResponseSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const StartNesResponseOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type StartNesResponse = z.output<typeof StartNesResponseSchema>;

const NesSuggestionIdSchema = z.string();

const NesSuggestionIdOutboundSchema = z.string();

type NesSuggestionId = z.output<typeof NesSuggestionIdSchema>;

const PositionSchema = z.looseObject({
  line: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  character: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const PositionOutboundSchema = z.strictObject({
  line: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  character: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type Position = z.output<typeof PositionSchema>;

const RangeSchema = z.looseObject({
  start: PositionSchema,
  end: PositionSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const RangeOutboundSchema = z.strictObject({
  start: PositionOutboundSchema,
  end: PositionOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type Range = z.output<typeof RangeSchema>;

const NesTextEditSchema = z.looseObject({
  range: RangeSchema,
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesTextEditOutboundSchema = z.strictObject({
  range: RangeOutboundSchema,
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesTextEdit = z.output<typeof NesTextEditSchema>;

const NesEditSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  edits: z.array(NesTextEditSchema),
  cursorPosition: z.union([PositionSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesEditSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  edits: z.array(NesTextEditOutboundSchema),
  cursorPosition: z.union([PositionOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesEditSuggestion = z.output<typeof NesEditSuggestionSchema>;

const NesJumpSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  position: PositionSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesJumpSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  position: PositionOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesJumpSuggestion = z.output<typeof NesJumpSuggestionSchema>;

const NesRenameSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  position: PositionSchema,
  newName: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesRenameSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  position: PositionOutboundSchema,
  newName: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesRenameSuggestion = z.output<typeof NesRenameSuggestionSchema>;

const NesSearchAndReplaceSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  search: z.string(),
  replace: z.string(),
  isRegex: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

const NesSearchAndReplaceSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  search: z.string(),
  replace: z.string(),
  isRegex: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

type NesSearchAndReplaceSuggestion = z.output<typeof NesSearchAndReplaceSuggestionSchema>;

export {
  SessionInfoSchema,
  SessionInfoOutboundSchema,
  type SessionInfo,
  ListSessionsResponseSchema,
  ListSessionsResponseOutboundSchema,
  type ListSessionsResponse,
  DeleteSessionResponseSchema,
  DeleteSessionResponseOutboundSchema,
  type DeleteSessionResponse,
  ForkSessionResponseSchema,
  ForkSessionResponseOutboundSchema,
  type ForkSessionResponse,
  ResumeSessionResponseSchema,
  ResumeSessionResponseOutboundSchema,
  type ResumeSessionResponse,
  CloseSessionResponseSchema,
  CloseSessionResponseOutboundSchema,
  type CloseSessionResponse,
  SetSessionModeResponseSchema,
  SetSessionModeResponseOutboundSchema,
  type SetSessionModeResponse,
  SetSessionConfigOptionResponseSchema,
  SetSessionConfigOptionResponseOutboundSchema,
  type SetSessionConfigOptionResponse,
  StopReasonSchema,
  StopReasonOutboundSchema,
  type StopReason,
  UsageSchema,
  UsageOutboundSchema,
  type Usage,
  PromptResponseSchema,
  PromptResponseOutboundSchema,
  type PromptResponse,
  StartNesResponseSchema,
  StartNesResponseOutboundSchema,
  type StartNesResponse,
  NesSuggestionIdSchema,
  NesSuggestionIdOutboundSchema,
  type NesSuggestionId,
  PositionSchema,
  PositionOutboundSchema,
  type Position,
  RangeSchema,
  RangeOutboundSchema,
  type Range,
  NesTextEditSchema,
  NesTextEditOutboundSchema,
  type NesTextEdit,
  NesEditSuggestionSchema,
  NesEditSuggestionOutboundSchema,
  type NesEditSuggestion,
  NesJumpSuggestionSchema,
  NesJumpSuggestionOutboundSchema,
  type NesJumpSuggestion,
  NesRenameSuggestionSchema,
  NesRenameSuggestionOutboundSchema,
  type NesRenameSuggestion,
  NesSearchAndReplaceSuggestionSchema,
  NesSearchAndReplaceSuggestionOutboundSchema,
  type NesSearchAndReplaceSuggestion,
};
