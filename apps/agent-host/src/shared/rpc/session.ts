import * as z from "zod";
import {
  ChatTurnCancelledActionSchema as AHPChatTurnCancelledActionSchema,
  ChatTurnStartedActionSchema as AHPChatTurnStartedActionSchema,
} from "@experiments/protocol-schemas/ahp";
import type {
  CreateSessionParams as AHPCreateSessionParams,
  SubscribeView as AHPSubscribeView,
} from "@experiments/protocol-schemas/ahp";
import type {
  ActionOrigin as AHPActionOrigin,
  ChatState as AHPChatState,
  SessionState as AHPSessionState,
} from "@microsoft/agent-host-protocol";
import { CodedRpcError } from "./errors";

/** The AHP `createSession` parameters. The channel must be the session channel of the object. */
export type SessionCreateRequest = AHPCreateSessionParams;

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

/** `view` sets the loaded history of a chat subscription. The session channel ignores it. */
export type SessionSubscribeRequest = { router: string; channel: string; view?: AHPSubscribeView };

export type SessionSubscribeResponse = {
  revision: number;
  state: AHPSessionState | AHPChatState;
};

export type SessionUnsubscribeRequest = { router: string; channels: string[] };

export type SessionRouterClosedRequest = { router: string };

/** The AHP `fetchTurns` parameters, and the router that receives the loaded turns first. */
export type SessionFetchTurnsRequest = { router: string; channel: string; cursor?: string };

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

export class SessionFetchTurnsError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "SessionFetchTurnsError";
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
   * Creates the session, adds it to the host catalogue, and opens its ACP connection. Resolves
   * after the session is ready. A repeated call with the same provider and working directory
   * waits for the same creation, so a caller can retry it.
   *
   * A transient failure rejects the call, and a `finishCreate` alarm continues the creation. An
   * agent error response disposes the session before the call rejects.
   *
   * @throws {SessionCreateError} If the parameters are not valid, the session exists with other
   * parameters, or setup fails.
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
   * The chat snapshot contains the shared loaded-history window. It can contain more turns
   * than `view` requests.
   *
   * @throws {SessionSubscribeError} If the session is absent, the channel does not belong
   * to it, or the router closed.
   */
  subscribe(req: SessionSubscribeRequest): Promise<SessionSubscribeResponse>;

  /**
   * Loads the next page of older turns into the history that the subscribers of the chat share.
   * The subscribers receive a `chat/turnsLoaded` action. The call resolves after the requesting
   * router receives it. A retry with a cursor that a call already used loads nothing.
   *
   * @throws {SessionFetchTurnsError} If the session is absent, the channel does not belong to
   * it, or the cursor is unknown. An unknown cursor has the `InvalidParams` code.
   */
  fetchTurns(req: SessionFetchTurnsRequest): Promise<void>;

  /** Removes subscriptions of a router. Succeeds if the session or subscription is absent. */
  unsubscribe(req: SessionUnsubscribeRequest): Promise<void>;

  /**
   * Removes all subscriptions of a router whose connection closed, and rejects its later
   * subscribe requests. Does nothing for an absent session.
   */
  routerClosed(req: SessionRouterClosedRequest): Promise<void>;

  /**
   * Stops the ACP connection, tells subscribed routers, removes the session from the host
   * catalogue, and then deletes all session storage. The dispose commits before these steps. After
   * the commit, a failure leaves the session disposing, and a `finishDispose` alarm completes it.
   *
   * For an absent session, removes any catalogue entry with the session ID.
   *
   * @throws {SessionDisposeError} If the session and its catalogue entry are absent, with the
   * `SessionNotFound` code, or if the host does not acknowledge the removal.
   */
  dispose(): Promise<void>;
}
