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
import { CodedRpcError } from "./errors";

export type SessionCreateRequest = {
  hostId: string;
  sessionId: string;
  chatId: string;
  provider: string;
  createdAt: string;
  workingDirectory?: string;
};

/** The client actions a session accepts through `dispatch`. */
export const SessionDispatchActionSchema = z.discriminatedUnion("type", [
  AHPChatTurnStartedActionSchema,
  AHPChatTurnCancelledActionSchema,
]);

export type SessionDispatchRequest = {
  channel: string;
  action: z.output<typeof SessionDispatchActionSchema>;
  origin: AHPActionOrigin;
};

export type SessionSubscribeRequest = { router: string; channel: string };

export type SessionSubscribeResponse = {
  revision: number;
  state: AHPSessionState | AHPChatState;
};

export type SessionUnsubscribeRequest = { router: string; channels: string[] };

export class SessionCreateError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "SessionCreateError";
  }
}

export class SessionDispatchError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "SessionDispatchError";
  }
}

export class SessionSubscribeError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "SessionSubscribeError";
  }
}

export class SessionDisposeError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "SessionDisposeError";
  }
}

export interface SessionRPC extends Rpc.DurableObjectBranded {
  /**
   * Creates persisted session state and opens its ACP connection.
   * Resolves after the session is ready. Failed setup removes the session state.
   *
   * @throws {SessionCreateError} If the session exists or setup fails.
   */
  create(req: SessionCreateRequest): Promise<void>;

  /**
   * Accepts a text turn or cancels the matching active turn.
   * A turn start resolves after the session stores the turn, before the agent completes it.
   * Subscribers receive accepted actions as pushes. Agent failures after acceptance arrive as
   * chat error actions.
   *
   * @throws {SessionDispatchError} If the action is invalid, rejected, or cannot be applied.
   */
  dispatch(req: SessionDispatchRequest): Promise<void>;

  /**
   * Subscribes a router to the session channel or to its default chat, and returns the state
   * and revision of the channel. The router receives each revision after the returned one.
   *
   * @throws {SessionSubscribeError} If the session is absent or the channel does not belong
   * to it.
   */
  subscribe(req: SessionSubscribeRequest): Promise<SessionSubscribeResponse>;

  /** Removes subscriptions of a router. Succeeds if the session or subscription is absent. */
  unsubscribe(req: SessionUnsubscribeRequest): Promise<void>;

  /**
   * Stops the ACP connection, tells subscribed routers, and removes all session storage.
   * Calling this on an absent session succeeds.
   *
   * @throws {SessionDisposeError} If cancellation or cleanup fails.
   */
  dispose(): Promise<void>;
}
