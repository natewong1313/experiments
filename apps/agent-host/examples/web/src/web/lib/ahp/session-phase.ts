import { SessionStatus as AHPSessionStatus } from "@microsoft/agent-host-protocol";

/** The AHP `InputNeeded` status bit covers both tool confirmations and input requests. Both map to `waiting`. */
export type AhpSessionPhase = "idle" | "busy" | "waiting" | "error";

export function hasStatusFlag(value: number, flag: number): boolean {
  return (value & flag) === flag;
}

export function sessionPhase(status: AHPSessionStatus): AhpSessionPhase {
  if (hasStatusFlag(status, AHPSessionStatus.Error)) {
    return "error";
  }

  if (hasStatusFlag(status, AHPSessionStatus.InputNeeded)) {
    return "waiting";
  }

  return hasStatusFlag(status, AHPSessionStatus.InProgress) ? "busy" : "idle";
}
