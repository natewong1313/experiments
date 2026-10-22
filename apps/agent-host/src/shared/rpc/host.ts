import * as z from "zod";
import { SessionSummarySchema as AHPSessionSummarySchema } from "@experiments/protocol-schemas/ahp";
import type { ListSessionsResult as AHPListSessionsResult } from "@experiments/protocol-schemas/ahp";
import type { RootState as AHPRootState } from "@microsoft/agent-host-protocol";
import { CodedRpcError } from "./errors";

export type HostSubscribeRootRequest = { router: string };

export type HostSubscribeRootResponse = { revision: number; state: AHPRootState };

export type HostUnsubscribeRootRequest = { router: string };

export type HostRouterClosedRequest = { router: string };

/**
 * The catalogue entry of a session at one session revision. `sessionCreated` and
 * `summaryChanged` send it.
 */
export const HostSessionEntrySchema = z.object({
  sessionId: z.string(),
  /** A session that reuses the ID of a disposed session has a new default chat URI. */
  defaultChat: z.string(),
  revision: z.int().nonnegative(),
  summary: AHPSessionSummarySchema,
});

export type HostSessionEntry = z.input<typeof HostSessionEntrySchema>;

export type HostSessionRemovedRequest = { sessionId: string; defaultChat: string };

export type HostOrphanRemovedRequest = { sessionId: string };

export type HostRemovedResponse = { removed: boolean };

export class HostSubscribeRootError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "HostSubscribeRootError";
  }
}

export class HostListSessionsError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "HostListSessionsError";
  }
}

export class HostSessionCreatedError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "HostSessionCreatedError";
  }
}

export class HostSessionRemovedError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "HostSessionRemovedError";
  }
}

export class HostSummaryChangedError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "HostSummaryChangedError";
  }
}

export interface HostRPC extends Rpc.DurableObjectBranded {
  /**
   * Subscribes a router to the root channel. The router receives each root revision after
   * the returned revision.
   *
   * @throws {HostSubscribeRootError} If the router closed or the subscription cannot be stored.
   */
  subscribeRoot(req: HostSubscribeRootRequest): Promise<HostSubscribeRootResponse>;

  /** Removes the root subscription of a router. Succeeds if the router has none. */
  unsubscribeRoot(req: HostUnsubscribeRootRequest): Promise<void>;

  /**
   * Removes the root subscription of a router whose connection closed, and rejects its later
   * subscribe requests.
   */
  routerClosed(req: HostRouterClosedRequest): Promise<void>;

  /**
   * Returns the summary of each session in the catalog.
   *
   * @throws {HostListSessionsError} If the catalogue cannot be read.
   */
  listSessions(): Promise<AHPListSessionsResult>;

  /**
   * Adds a session to the catalogue and tells root subscribers. Does nothing if the catalogue
   * has the session with the same default chat.
   *
   * @throws {HostSessionCreatedError} If validation or storage fails, or if the catalogue has
   * the session ID with a different default chat.
   */
  sessionCreated(req: HostSessionEntry): Promise<void>;

  /**
   * Stores the latest summary of a session and tells root subscribers which fields changed.
   * Ignores sessions absent from the catalogue, replaced sessions, and old revisions.
   *
   * @throws {HostSummaryChangedError} If validation or storage fails.
   */
  summaryChanged(req: HostSessionEntry): Promise<void>;

  /**
   * Removes a session from the catalogue and tells root subscribers. Ignores an entry with a
   * different default chat. Returns whether the host removed an entry.
   *
   * @throws {HostSessionRemovedError} If storage fails.
   */
  sessionRemoved(req: HostSessionRemovedRequest): Promise<HostRemovedResponse>;

  /**
   * Removes the catalogue entry with the session ID, whatever its default chat. Only a session
   * object without a session sends this request. Returns whether the host removed an entry.
   *
   * @throws {HostSessionRemovedError} If storage fails.
   */
  orphanRemoved(req: HostOrphanRemovedRequest): Promise<HostRemovedResponse>;
}
