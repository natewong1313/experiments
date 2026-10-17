import type { HostRPC } from "./rpc/host";
import type { ConnectionRouterRPC } from "./rpc/router";
import type { SessionRPC } from "./rpc/session";

type StubContracts = {
  host: HostRPC;
  session: SessionRPC;
  router: ConnectionRouterRPC;
};

/** The kinds of Durable Object that the agent host classes call. */
export type StubKind = keyof StubContracts;

/**
 * The RPC contract of one kind of Durable Object. A stub from `getByName` on a namespace of
 * the matching class is assignable to it.
 */
export type StubFor<K extends StubKind> = StubContracts[K];
