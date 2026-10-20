import type { StubFor } from "../../shared/stubs";
import type { RouterDatabase } from "../db/database";
import type { RemoteSubscriptions } from "./remote-subscriptions";
import type { ServerSequence } from "./server-sequence";
import type { SubscriptionStore } from "./subscription-store";

export type Stubs = {
  host(): StubFor<"host">;
  session(sessionId: string): StubFor<"session">;
};

/**
 * The shared resources of one router. The router services receive them at construction. The
 * services themselves are not in this type. A service that needs another service receives it
 * as a separate constructor argument.
 */
export type AgentHostConnectionRouterDeps = {
  ctx: DurableObjectState;
  db: RouterDatabase;
  stubs: Stubs;
  sequence: ServerSequence;
  remoteSubscriptions: RemoteSubscriptions;
  subscriptionStore: SubscriptionStore;
};
