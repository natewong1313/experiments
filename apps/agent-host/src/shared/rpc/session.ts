import * as z from "zod";
import {
  ChatTurnCancelledActionSchema as AHPChatTurnCancelledActionSchema,
  ChatTurnStartedActionSchema as AHPChatTurnStartedActionSchema,
} from "@experiments/protocol-schemas/ahp";
import type {
  ActionOrigin as AHPActionOrigin,
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
} from "@microsoft/agent-host-protocol";

export type SessionCreateRequest = {
  hostId: string;
  sessionId: string;
  chatId: string;
  provider: string;
  createdAt: string;
  workingDirectory?: string;
};

export class SessionCreateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCreateError";
  }
}

/** The client actions a session accepts through `dispatch`. */
export const SessionDispatchActionSchema = z.discriminatedUnion("type", [
  AHPChatTurnStartedActionSchema,
  AHPChatTurnCancelledActionSchema,
]);

export type SessionDispatchRequest = {
  action: z.output<typeof SessionDispatchActionSchema>;
  origin: AHPActionOrigin;
};

export class SessionDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionDispatchError";
  }
}

export type SessionSnapshotRequest = { channel: string };

export type SessionSnapshotResponse = {
  revision: number;
  state: AHPSessionState | AHPChatState;
};

export class SessionSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionSnapshotError";
  }
}

export class SessionDisposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionDisposeError";
  }
}

export interface SessionRPC {
  /**
   * Creates persisted session state and opens its ACP connection.
   * Resolves after the host receives the session-ready update.
   * Failed setup removes the newly created session state.
   *
   * @throws {SessionCreateError} If the session exists or setup fails.
   */
  create(req: SessionCreateRequest): Promise<void>;

  /**
   * Accepts a text turn or cancels the matching active turn.
   * Starting a turn resolves after persistence and scheduling, before agent completion.
   * Cancellation resolves after publishing the action and sending ACP cancellation.
   * Publishes agent failures after acceptance as chat error actions.
   *
   * @throws {SessionDispatchError} If the action is invalid, rejected, or cannot be applied.
   */
  dispatch(req: SessionDispatchRequest): Promise<void>;

  /**
   * Returns the persisted state and revision for this session or its default chat.
   *
   * @throws {SessionSnapshotError} If the session is absent, the channel does not belong to it,
   * or reading the persisted state fails.
   */
  snapshot(req: SessionSnapshotRequest): Promise<SessionSnapshotResponse>;

  /**
   * Stops the ACP connection and removes the session's persisted history.
   * Calling this on an absent session succeeds.
   * Cleanup still runs if ACP cancellation fails.
   *
   * @throws {SessionDisposeError} If cancellation or cleanup fails.
   */
  dispose(): Promise<void>;
}

export type SessionNamespace = DurableObjectNamespace<SessionRPC & Rpc.DurableObjectBranded>;
