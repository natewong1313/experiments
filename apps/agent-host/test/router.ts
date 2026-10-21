import { AgentHostConnectionRouter as BaseRouter } from "../src";
import type { RouterDurabilityPolicy } from "../src/router/dependencies/router-durability";
import type { AgentHost } from "./host";
import type { AgentSession } from "./session";
import type { TestEnv } from "./worker";

export class AgentHostConnectionRouter extends BaseRouter<TestEnv, AgentHost, AgentSession> {
  host = this.env.COORDINATORS;
  session = this.env.CONVERSATIONS;
  private durabilityPolicy?: RouterDurabilityPolicy;

  /** Replaces the timing of the durable calls. Call it before the router opens its storage. */
  useDurabilityPolicy(policy: RouterDurabilityPolicy): void {
    this.durabilityPolicy = policy;
  }

  protected getDurabilityPolicy(): RouterDurabilityPolicy {
    return this.durabilityPolicy ?? super.getDurabilityPolicy();
  }
}
