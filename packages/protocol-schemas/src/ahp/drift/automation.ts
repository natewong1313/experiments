import type {
  AutomationDefinition,
  AutomationEntry,
  AutomationRunState,
  AutomationRunSummary,
  AutomationState,
  AutomationTrigger,
  TelemetryCapabilities,
} from "@microsoft/agent-host-protocol";
import type * as z from "zod";
import type {
  AutomationDefinitionSchema,
  AutomationEntrySchema,
  AutomationStateSchema,
  AutomationTriggerSchema,
} from "../channels/automation";
import type {
  AutomationRunStateSchema,
  AutomationRunSummarySchema,
} from "../channels/automation-run";
import type { TelemetryCapabilitiesSchema } from "../channels/otlp";

type SameKeys<T extends object, U extends object> = [Exclude<keyof T, keyof U>] extends [never]
  ? [Exclude<keyof U, keyof T>] extends [never] ? true : false
  : false;

type Drift<Upstream extends object, Ours extends object> = SameKeys<Upstream, Ours>;

type UnionDrift<Upstream, Ours> = [Upstream] extends [Ours] ? true : false;

type Expect<T extends true> = T;

type AutomationDefinitionDrift = Drift<AutomationDefinition, z.output<typeof AutomationDefinitionSchema>>;
type AutomationTriggerDrift = UnionDrift<AutomationTrigger, z.output<typeof AutomationTriggerSchema>>;
type AutomationEntryDrift = Drift<AutomationEntry, z.output<typeof AutomationEntrySchema>>;
type AutomationStateDrift = Drift<AutomationState, z.output<typeof AutomationStateSchema>>;
type AutomationRunSummaryDrift = Drift<AutomationRunSummary, z.output<typeof AutomationRunSummarySchema>>;
type AutomationRunStateDrift = Drift<AutomationRunState, z.output<typeof AutomationRunStateSchema>>;
type TelemetryCapabilitiesDrift = Drift<TelemetryCapabilities, z.output<typeof TelemetryCapabilitiesSchema>>;

type _Automation = [
  Expect<AutomationDefinitionDrift>,
  Expect<AutomationTriggerDrift>,
  Expect<AutomationEntryDrift>,
  Expect<AutomationStateDrift>,
  Expect<AutomationRunSummaryDrift>,
  Expect<AutomationRunStateDrift>,
  Expect<TelemetryCapabilitiesDrift>,
];

