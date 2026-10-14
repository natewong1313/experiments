import type {
  ActionOrigin,
  ChatAction,
  SessionAction,
  SessionSummary as AHPSessionSummary,
} from "@microsoft/agent-host-protocol";

export type HostSessionUpdateRequest = {
  sessionId: string;
  revision: number;
  summary: AHPSessionSummary;
  actions: { channel: string; action: ChatAction | SessionAction; origin?: ActionOrigin }[];
};

export class HostSessionUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostSessionUpdateError";
  }
}

export interface HostRPC extends Rpc.DurableObjectBranded {
  /**
   * A session notifies its host after persisting a state update.
   * Resolves after updating the catalogue and broadcasting or buffering actions for subscribers.
   * Ignores updates for sessions absent from the catalogue.
   *
   * @throws {HostSessionUpdateError} If validation, storage, or socket delivery fails.
   */
  sessionUpdate(req: HostSessionUpdateRequest): Promise<void>;
}
