import type {
  AgentInfo,
  RootState,
  SessionModelInfo,
  TerminalContentPart,
  TerminalInfo,
  TerminalState,
} from "@microsoft/agent-host-protocol";
import type * as z from "zod";
import type { AgentInfoSchema, RootStateSchema, SessionModelInfoSchema } from "../channels/root";
import type {
  TerminalContentPartSchema,
  TerminalInfoSchema,
  TerminalStateSchema,
} from "../channels/terminal";

type SameKeys<T extends object, U extends object> = [Exclude<keyof T, keyof U>] extends [never]
  ? [Exclude<keyof U, keyof T>] extends [never]
    ? true
    : false
  : false;

type Drift<Upstream extends object, Ours extends object> = SameKeys<Upstream, Ours>;

type Expect<T extends true> = T;

type RootStateDrift = Drift<RootState, z.output<typeof RootStateSchema>>;

type AgentInfoDrift = Drift<AgentInfo, z.output<typeof AgentInfoSchema>>;

type SessionModelInfoDrift = Drift<SessionModelInfo, z.output<typeof SessionModelInfoSchema>>;

type TerminalInfoDrift = Drift<TerminalInfo, z.output<typeof TerminalInfoSchema>>;

type TerminalStateDrift = Drift<TerminalState, z.output<typeof TerminalStateSchema>>;

type TerminalContentPartDrift = Drift<
  TerminalContentPart,
  z.output<typeof TerminalContentPartSchema>
>;

type _Root = [
  Expect<RootStateDrift>,
  Expect<AgentInfoDrift>,
  Expect<SessionModelInfoDrift>,
  Expect<TerminalInfoDrift>,
  Expect<TerminalStateDrift>,
  Expect<TerminalContentPartDrift>,
];
