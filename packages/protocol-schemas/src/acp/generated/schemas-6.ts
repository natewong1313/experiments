// Generated from the catalog-pinned ACP SDK. Run pnpm generate:acp.
import * as z from "zod";
import { SessionIdSchema, SessionIdOutboundSchema } from "./schemas-0";
import {
  SessionModeStateSchema,
  SessionModeStateOutboundSchema,
  SessionConfigOptionSchema,
  SessionConfigOptionOutboundSchema,
} from "./schemas-5";

export const SessionInfoSchema = z.looseObject({
  sessionId: SessionIdSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SessionInfoOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  cwd: z.string(),
  additionalDirectories: z.array(z.string()).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  updatedAt: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SessionInfo = z.output<typeof SessionInfoSchema>;

export const ListSessionsResponseSchema = z.looseObject({
  sessions: z.array(SessionInfoSchema),
  nextCursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ListSessionsResponseOutboundSchema = z.strictObject({
  sessions: z.array(SessionInfoOutboundSchema),
  nextCursor: z.union([z.string(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ListSessionsResponse = z.output<typeof ListSessionsResponseSchema>;

export const DeleteSessionResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const DeleteSessionResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type DeleteSessionResponse = z.output<typeof DeleteSessionResponseSchema>;

export const ForkSessionResponseSchema = z.looseObject({
  sessionId: SessionIdSchema,
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ForkSessionResponseOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ForkSessionResponse = z.output<typeof ForkSessionResponseSchema>;

export const ResumeSessionResponseSchema = z.looseObject({
  modes: z.union([SessionModeStateSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const ResumeSessionResponseOutboundSchema = z.strictObject({
  modes: z.union([SessionModeStateOutboundSchema, z.null()]).optional(),
  configOptions: z.union([z.array(SessionConfigOptionOutboundSchema), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type ResumeSessionResponse = z.output<typeof ResumeSessionResponseSchema>;

export const CloseSessionResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const CloseSessionResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type CloseSessionResponse = z.output<typeof CloseSessionResponseSchema>;

export const SetSessionModeResponseSchema = z.looseObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SetSessionModeResponseOutboundSchema = z.strictObject({
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SetSessionModeResponse = z.output<typeof SetSessionModeResponseSchema>;

export const SetSessionConfigOptionResponseSchema = z.looseObject({
  configOptions: z.array(SessionConfigOptionSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const SetSessionConfigOptionResponseOutboundSchema = z.strictObject({
  configOptions: z.array(SessionConfigOptionOutboundSchema),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type SetSessionConfigOptionResponse = z.output<typeof SetSessionConfigOptionResponseSchema>;

export const StopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);

export const StopReasonOutboundSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
  "cancelled",
]);

export type StopReason = z.output<typeof StopReasonSchema>;

export const UsageSchema = z.looseObject({
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

export const UsageOutboundSchema = z.strictObject({
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

export type Usage = z.output<typeof UsageSchema>;

export const PromptResponseSchema = z.looseObject({
  stopReason: StopReasonSchema,
  usage: z.union([UsageSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PromptResponseOutboundSchema = z.strictObject({
  stopReason: StopReasonOutboundSchema,
  usage: z.union([UsageOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type PromptResponse = z.output<typeof PromptResponseSchema>;

export const StartNesResponseSchema = z.looseObject({
  sessionId: SessionIdSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const StartNesResponseOutboundSchema = z.strictObject({
  sessionId: SessionIdOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type StartNesResponse = z.output<typeof StartNesResponseSchema>;

export const NesSuggestionIdSchema = z.string();

export const NesSuggestionIdOutboundSchema = z.string();

export type NesSuggestionId = z.output<typeof NesSuggestionIdSchema>;

export const PositionSchema = z.looseObject({
  line: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  character: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const PositionOutboundSchema = z.strictObject({
  line: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  character: z.number().refine(Number.isInteger, { error: "Expected integer" }).check(z.gte(0)),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Position = z.output<typeof PositionSchema>;

export const RangeSchema = z.looseObject({
  start: PositionSchema,
  end: PositionSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const RangeOutboundSchema = z.strictObject({
  start: PositionOutboundSchema,
  end: PositionOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type Range = z.output<typeof RangeSchema>;

export const NesTextEditSchema = z.looseObject({
  range: RangeSchema,
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesTextEditOutboundSchema = z.strictObject({
  range: RangeOutboundSchema,
  newText: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesTextEdit = z.output<typeof NesTextEditSchema>;

export const NesEditSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  edits: z.array(NesTextEditSchema),
  cursorPosition: z.union([PositionSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesEditSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  edits: z.array(NesTextEditOutboundSchema),
  cursorPosition: z.union([PositionOutboundSchema, z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesEditSuggestion = z.output<typeof NesEditSuggestionSchema>;

export const NesJumpSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  position: PositionSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesJumpSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  position: PositionOutboundSchema,
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesJumpSuggestion = z.output<typeof NesJumpSuggestionSchema>;

export const NesRenameSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  position: PositionSchema,
  newName: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesRenameSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  position: PositionOutboundSchema,
  newName: z.string(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesRenameSuggestion = z.output<typeof NesRenameSuggestionSchema>;

export const NesSearchAndReplaceSuggestionSchema = z.looseObject({
  id: NesSuggestionIdSchema,
  uri: z.string(),
  search: z.string(),
  replace: z.string(),
  isRegex: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export const NesSearchAndReplaceSuggestionOutboundSchema = z.strictObject({
  id: NesSuggestionIdOutboundSchema,
  uri: z.string(),
  search: z.string(),
  replace: z.string(),
  isRegex: z.union([z.boolean(), z.null()]).optional(),
  _meta: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
});

export type NesSearchAndReplaceSuggestion = z.output<typeof NesSearchAndReplaceSuggestionSchema>;
