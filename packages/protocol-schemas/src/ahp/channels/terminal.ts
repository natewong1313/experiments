import * as z from "zod";
import { uriSchema } from "../common";

const TerminalLifecycleStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("running") }),
  z.strictObject({ status: z.literal("exited"), exitCode: z.number().optional() }),
]);

const TerminalClaimSchema = z.discriminatedUnion("kind", [
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

const TerminalUnclassifiedPartSchema = z.strictObject({
  type: z.literal("unclassified"),
  value: z.string(),
});

const TerminalCommandPartSchema = z.strictObject({
  type: z.literal("command"),
  commandId: z.string(),
  commandLine: z.string(),
  output: z.string(),
  timestamp: z.number(),
  isComplete: z.boolean(),
  exitCode: z.number().optional(),
  durationMs: z.number().optional(),
});

const TerminalContentPartSchema = z.union([
  TerminalUnclassifiedPartSchema,
  TerminalCommandPartSchema,
]);

const TerminalInfoSchema = z.strictObject({
  resource: uriSchema,
  title: z.string(),
  claim: TerminalClaimSchema,
  lifecycle: TerminalLifecycleStateSchema,
});

const TerminalStateSchema = z.strictObject({
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

const TerminalActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("terminal/data"), data: z.string() }),
  z.strictObject({ type: z.literal("terminal/input"), data: z.string() }),
  z.strictObject({ type: z.literal("terminal/resized"), cols: z.number(), rows: z.number() }),
  z.strictObject({ type: z.literal("terminal/claimed"), claim: TerminalClaimSchema }),
  z.strictObject({ type: z.literal("terminal/titleChanged"), title: z.string() }),
  z.strictObject({ type: z.literal("terminal/cwdChanged"), cwd: uriSchema }),
  z.strictObject({ type: z.literal("terminal/exited"), exitCode: z.number().optional() }),
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

type TerminalLifecycleState = z.output<typeof TerminalLifecycleStateSchema>;
type TerminalClaim = z.output<typeof TerminalClaimSchema>;
type TerminalUnclassifiedPart = z.output<typeof TerminalUnclassifiedPartSchema>;
type TerminalCommandPart = z.output<typeof TerminalCommandPartSchema>;
type TerminalContentPart = z.output<typeof TerminalContentPartSchema>;
type TerminalInfo = z.output<typeof TerminalInfoSchema>;
type TerminalState = z.output<typeof TerminalStateSchema>;
type TerminalAction = z.output<typeof TerminalActionSchema>;

export {
  TerminalActionSchema,
  TerminalClaimSchema,
  TerminalCommandPartSchema,
  TerminalContentPartSchema,
  TerminalInfoSchema,
  TerminalLifecycleStateSchema,
  TerminalStateSchema,
  TerminalUnclassifiedPartSchema,
  type TerminalAction,
  type TerminalClaim,
  type TerminalCommandPart,
  type TerminalContentPart,
  type TerminalInfo,
  type TerminalLifecycleState,
  type TerminalState,
  type TerminalUnclassifiedPart,
};
