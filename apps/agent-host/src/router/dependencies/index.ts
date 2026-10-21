import { untilAborted } from "../../shared/abort";
import type { StubFor } from "../../shared/stubs";
import { RouterDatabase } from "../db/database";
import { RemoteSubscriptions } from "./remote-subscriptions";
import { RouterDurability } from "./router-durability";
import type { RouterDurabilityPolicy } from "./router-durability";
import { ServerSequence } from "./server-sequence";
import { SubscriptionStore } from "./subscription-store";

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
  durability: RouterDurability;
};

export function createRouterDeps(
  ctx: DurableObjectState,
  routerName: string,
  stubs: Stubs,
  durabilityPolicy: () => RouterDurabilityPolicy,
): AgentHostConnectionRouterDeps {
  const db = new RouterDatabase(ctx.storage);
  const remoteSubscriptions = new RemoteSubscriptions(routerName, stubs);

  return {
    ctx,
    db,
    stubs,
    sequence: new ServerSequence(db),
    remoteSubscriptions,
    subscriptionStore: new SubscriptionStore(db),
    durability: new RouterDurability(
      ctx,
      {
        unsubscribeSenders: async ({ payload, signal }): Promise<void> => {
          await untilAborted(remoteSubscriptions.unsubscribeEach(payload), signal);
        },
      },
      durabilityPolicy,
    ),
  };
}
