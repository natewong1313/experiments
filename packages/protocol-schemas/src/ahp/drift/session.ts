import type {
  Changeset,
  ChangesetFile,
  ChangesetOperation,
  ChangesetState,
  AnnotationsSummary,
  Annotation,
  AnnotationEntry,
  AnnotationsState,
  Customization,
  McpServerState,
  ResourceChange,
  ResourceWatchState,
  SessionActiveClient,
  SessionInputRequest,
  SessionState,
  SessionSummary,
} from "@microsoft/agent-host-protocol";
import type * as z from "zod";
import type {
  ChangesetFileSchema,
  ChangesetOperationSchema,
  ChangesetSchema,
  ChangesetStateSchema,
} from "../channels/changeset";
import type {
  AnnotationEntrySchema,
  AnnotationSchema,
  AnnotationsStateSchema,
  AnnotationsSummarySchema,
} from "../channels/annotations";
import type {
  ResourceChangeSchema,
  ResourceWatchStateSchema,
} from "../channels/resource-watch";
import type {
  CustomizationSchema,
  McpServerStateSchema,
} from "../primitives";
import type {
  SessionActiveClientSchema,
  SessionInputRequestSchema,
  SessionStateSchema,
  SessionSummarySchema,
} from "../channels/session/state";

type SameKeys<T extends object, U extends object> = [Exclude<keyof T, keyof U>] extends [never]
  ? [Exclude<keyof U, keyof T>] extends [never] ? true : false
  : false;

type Drift<Upstream extends object, Ours extends object> = SameKeys<Upstream, Ours>;

type Expect<T extends true> = T;

type ChangesetDrift = Drift<Changeset, z.output<typeof ChangesetSchema>>;
type ChangesetFileDrift = Drift<ChangesetFile, z.output<typeof ChangesetFileSchema>>;
type ChangesetOperationDrift = Drift<ChangesetOperation, z.output<typeof ChangesetOperationSchema>>;
type ChangesetStateDrift = Drift<ChangesetState, z.output<typeof ChangesetStateSchema>>;
type AnnotationsSummaryDrift = Drift<AnnotationsSummary, z.output<typeof AnnotationsSummarySchema>>;
type AnnotationDrift = Drift<Annotation, z.output<typeof AnnotationSchema>>;
type AnnotationEntryDrift = Drift<AnnotationEntry, z.output<typeof AnnotationEntrySchema>>;
type AnnotationsStateDrift = Drift<AnnotationsState, z.output<typeof AnnotationsStateSchema>>;
type ResourceChangeDrift = Drift<ResourceChange, z.output<typeof ResourceChangeSchema>>;
type ResourceWatchStateDrift = Drift<ResourceWatchState, z.output<typeof ResourceWatchStateSchema>>;
type CustomizationDrift = Drift<Customization, z.output<typeof CustomizationSchema>>;
type McpServerStateDrift = Drift<McpServerState, z.output<typeof McpServerStateSchema>>;
type SessionActiveClientDrift = Drift<SessionActiveClient, z.output<typeof SessionActiveClientSchema>>;
type SessionInputRequestDrift = Drift<SessionInputRequest, z.output<typeof SessionInputRequestSchema>>;
type SessionStateDrift = Drift<SessionState, z.output<typeof SessionStateSchema>>;
type SessionSummaryDrift = Drift<SessionSummary, z.output<typeof SessionSummarySchema>>;

type _Session = [
  Expect<ChangesetDrift>,
  Expect<ChangesetFileDrift>,
  Expect<ChangesetOperationDrift>,
  Expect<ChangesetStateDrift>,
  Expect<AnnotationsSummaryDrift>,
  Expect<AnnotationDrift>,
  Expect<AnnotationEntryDrift>,
  Expect<AnnotationsStateDrift>,
  Expect<ResourceChangeDrift>,
  Expect<ResourceWatchStateDrift>,
  Expect<CustomizationDrift>,
  Expect<McpServerStateDrift>,
  Expect<SessionActiveClientDrift>,
  Expect<SessionInputRequestDrift>,
  Expect<SessionStateDrift>,
  Expect<SessionSummaryDrift>,
];

