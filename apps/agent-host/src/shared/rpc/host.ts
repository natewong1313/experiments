import * as z from "zod";
import { SessionSummarySchema as AHPSessionSummarySchema } from "@experiments/protocol-schemas/ahp";
import type {
  CreateSessionParams as AHPCreateSessionParams,
  ListSessionsResult as AHPListSessionsResult,
} from "@experiments/protocol-schemas/ahp";
import type { RootState as AHPRootState } from "@microsoft/agent-host-protocol";
import { CodedRpcError } from "./errors";

export type HostSubscribeRootRequest = { router: string };

export type HostSubscribeRootResponse = { revision: number; state: AHPRootState };

export type HostUnsubscribeRootRequest = { router: string };

export type HostDisposeSessionRequest = { sessionId: string };

export const HostSummaryChangedRequestSchema = z.object({
  sessionId: z.string(),
  /** A session that reuses the ID of a disposed session has a new default chat URI. */
  defaultChat: z.string(),
  revision: z.int().nonnegative(),
  summary: AHPSessionSummarySchema,
});

export type HostSummaryChangedRequest = z.input<typeof HostSummaryChangedRequestSchema>;

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

export class HostCreateSessionError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "HostCreateSessionError";
  }
}

export class HostDisposeSessionError extends CodedRpcError {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(cause);
    this.name = "HostDisposeSessionError";
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
   * @throws {HostSubscribeRootError} If the subscription cannot be stored.
   */
  subscribeRoot(req: HostSubscribeRootRequest): Promise<HostSubscribeRootResponse>;

  /** Removes the root subscription of a router. Succeeds if the router has none. */
  unsubscribeRoot(req: HostUnsubscribeRootRequest): Promise<void>;

  /**
   * Returns the summary of each session in the catalog.
   *
   * @throws {HostListSessionsError} If the catalogue cannot be read.
   */
  listSessions(): Promise<AHPListSessionsResult>;

  /**
   * Adds a session to the catalogue and creates its session Durable Object.
   * Resolves after the session is ready. Root subscribers see the session while it is creating.
   *
   * @throws {HostCreateSessionError} If the parameters are not valid, the session exists, or
   * agent setup fails. The error has the AHP error `code` for the client.
   */
  createSession(params: AHPCreateSessionParams): Promise<void>;

  /**
   * Disposes the session Durable Object and removes the session from the catalogue.
   *
   * @throws {HostDisposeSessionError} If the session does not exist or disposal fails.
   */
  disposeSession(req: HostDisposeSessionRequest): Promise<void>;

  /**
   * Stores the latest summary of a session and tells root subscribers which fields changed.
   * Ignores sessions absent from the catalogue, replaced sessions, and old revisions.
   *
   * @throws {HostSummaryChangedError} If validation or storage fails.
   */
  summaryChanged(req: HostSummaryChangedRequest): Promise<void>;
}
