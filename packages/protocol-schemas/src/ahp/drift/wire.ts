import type {
  InitializeResult,
  ListSessionsResult,
  Snapshot,
  StateAction,
  SubscribeResult,
} from "@microsoft/agent-host-protocol";
import type * as z from "zod";
import type {
  ActionEnvelopeSchema,
  SnapshotSchema,
} from "../envelope";
import type {
  InitializeResultSchema,
  ListSessionsResultSchema,
  SubscribeResultSchema,
} from "../commands";

type UnionDrift<Upstream, Ours> = [Upstream] extends [Ours] ? true : false;
type SameKeys<T extends object, U extends object> = [Exclude<keyof T, keyof U>] extends [never]
  ? [Exclude<keyof U, keyof T>] extends [never] ? true : false
  : false;

type Drift<Upstream extends object, Ours extends object> = SameKeys<Upstream, Ours>;

type Expect<T extends true> = T;

type SnapshotDrift = Drift<Snapshot, z.output<typeof SnapshotSchema>>;
type InitializeResultDrift = Drift<InitializeResult, z.output<typeof InitializeResultSchema>>;
type ListSessionsResultDrift = Drift<ListSessionsResult, z.output<typeof ListSessionsResultSchema>>;
type SubscribeResultDrift = Drift<SubscribeResult, z.output<typeof SubscribeResultSchema>>;
type StateActionDrift = UnionDrift<StateAction, z.output<typeof ActionEnvelopeSchema>["action"]>;

type _Wire = [
  Expect<SnapshotDrift>,
  Expect<InitializeResultDrift>,
  Expect<ListSessionsResultDrift>,
  Expect<SubscribeResultDrift>,
  Expect<StateActionDrift>,
];

