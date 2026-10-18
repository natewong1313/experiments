import type {
  ActionOrigin as AHPActionOrigin,
  ChatAction as AHPChatAction,
  SessionAction as AHPSessionAction,
} from "@microsoft/agent-host-protocol";
import type {
  RootAction as AHPRootAction,
  SessionSummary as AHPSessionSummary,
} from "@experiments/protocol-schemas/ahp";

/** An action on a session or chat channel, before the router adds its `serverSeq`. */
export type SessionEnvelope = {
  channel: string;
  action: AHPSessionAction | AHPChatAction;
  origin?: AHPActionOrigin;
};

/** The actions of one session revision. */
export type SessionUpdate = { revision: number; actions: SessionEnvelope[] };

/**
 * Consecutive session revisions that start after revision `after`. A request without updates
 * tells the router that the session is at revision `after`.
 */
export type RouterSessionActionsRequest = {
  sessionId: string;
  after: number;
  updates: SessionUpdate[];
};

/** The channels of the sender that the router still subscribes to. */
export type RouterPushResponse = { subscribed: string[] };

export type RouterSessionDisposedRequest = { sessionId: string };

/** One change on the root channel. Actions get a `serverSeq`; the other events do not. */
export type RootEvent =
  | { kind: "action"; action: AHPRootAction }
  | { kind: "sessionAdded"; summary: AHPSessionSummary }
  | { kind: "sessionRemoved"; session: string }
  | { kind: "sessionSummaryChanged"; session: string; changes: Partial<AHPSessionSummary> };

/** The event of one root revision. */
export type RootUpdate = RootEvent & { revision: number };

/**
 * Consecutive root revisions that start after revision `after`. A request without updates
 * tells the router that the host is at revision `after`.
 */
export type RouterRootUpdateRequest = { after: number; updates: RootUpdate[] };

/**
 * The methods that hosts and sessions call to push updates to one client connection.
 *
 * Each sender sends one push at a time to each router, in revision order. A router ignores
 * revisions that it already has. A router that finds a gap closes its WebSocket, because the
 * senders keep no history to fill the gap.
 */
export interface AgentHostConnectionRouterRPC extends Rpc.DurableObjectBranded {
  /** Forwards session and chat actions to the client. */
  sessionActions(req: RouterSessionActionsRequest): Promise<RouterPushResponse>;

  /** Removes the subscriptions of a disposed session without a message to the client. */
  sessionDisposed(req: RouterSessionDisposedRequest): Promise<void>;

  /** Forwards root actions and root notifications to the client. */
  rootUpdate(req: RouterRootUpdateRequest): Promise<RouterPushResponse>;
}
