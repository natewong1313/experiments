import { DEFAULT_ROUTER_CONFIG } from "../src/router/dependencies/router-durability";
import { AgentHostConnectionRouter } from "./router";

/**
 * A router whose unsubscribe attempts time out after 50 ms. The close-retry test stalls the
 * first attempt; the short timeout ends it so the retry runs within the test timeout.
 */
export class StallingConnectionRouter extends AgentHostConnectionRouter {
  protected override config = { ...DEFAULT_ROUTER_CONFIG, unsubscribeAttemptTimeoutMs: 50 };
}
