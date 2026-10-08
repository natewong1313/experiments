import * as z from "zod";
import { uriSchema } from "../common";

export const TerminalLifecycleStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("running") }),
  z.strictObject({
    status: z.literal("exited"),
    exitCode: z.number().optional(),
  }),
]);

export const TerminalClaimSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("client"),
    clientId: z.string(),
  }),
  z.strictObject({
    kind: z.literal("session"),
    session: uriSchema,
    chat: uriSchema,
    turnId: z.string().optional(),
    toolCallId: z.string().optional(),
  }),
]);

export const TerminalUnclassifiedPartSchema = z.strictObject({
  type: z.literal("unclassified"),
  value: z.string(),
});

export const TerminalCommandPartSchema = z.strictObject({
  type: z.literal("command"),
  commandId: z.string(),
  commandLine: z.string(),
  output: z.string(),
  timestamp: z.number(),
  isComplete: z.boolean(),
  exitCode: z.number().optional(),
  durationMs: z.number().optional(),
});

export const TerminalContentPartSchema = z.union([
  TerminalUnclassifiedPartSchema,
  TerminalCommandPartSchema,
]);

export const TerminalInfoSchema = z.strictObject({
  resource: uriSchema,
  title: z.string(),
  claim: TerminalClaimSchema,
  lifecycle: TerminalLifecycleStateSchema,
});

export const TerminalStateSchema = z.strictObject({
  title: z.string(),
  cwd: uriSchema.optional(),
  cols: z.number().optional(),
  rows: z.number().optional(),
  content: z.array(TerminalContentPartSchema),
  lifecycle: TerminalLifecycleStateSchema,
  claim: TerminalClaimSchema,
  supportsCommandDetection: z.boolean().optional(),
  isPty: z.boolean().optional(),
});

export const TerminalActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("terminal/data"), data: z.string() }),
  z.strictObject({ type: z.literal("terminal/input"), data: z.string() }),
  z.strictObject({
    type: z.literal("terminal/resized"),
    cols: z.number(),
    rows: z.number(),
  }),
  z.strictObject({
    type: z.literal("terminal/claimed"),
    claim: TerminalClaimSchema,
  }),
  z.strictObject({
    type: z.literal("terminal/titleChanged"),
    title: z.string(),
  }),
  z.strictObject({ type: z.literal("terminal/cwdChanged"), cwd: uriSchema }),
  z.strictObject({
    type: z.literal("terminal/exited"),
    exitCode: z.number().optional(),
  }),
  z.strictObject({ type: z.literal("terminal/cleared") }),
  z.strictObject({ type: z.literal("terminal/commandDetectionAvailable") }),
  z.strictObject({
    type: z.literal("terminal/commandExecuted"),
    commandId: z.string(),
    commandLine: z.string(),
    timestamp: z.number(),
  }),
  z.strictObject({
    type: z.literal("terminal/commandFinished"),
    commandId: z.string(),
    exitCode: z.number().optional(),
    durationMs: z.number().optional(),
  }),
]);

export type TerminalLifecycleState = z.output<typeof TerminalLifecycleStateSchema>;

export type TerminalClaim = z.output<typeof TerminalClaimSchema>;

export type TerminalUnclassifiedPart = z.output<typeof TerminalUnclassifiedPartSchema>;

export type TerminalCommandPart = z.output<typeof TerminalCommandPartSchema>;

export type TerminalContentPart = z.output<typeof TerminalContentPartSchema>;

export type TerminalInfo = z.output<typeof TerminalInfoSchema>;

export type TerminalState = z.output<typeof TerminalStateSchema>;

export type TerminalAction = z.output<typeof TerminalActionSchema>;
