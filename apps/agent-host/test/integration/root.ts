import { AgentHostRoot as BaseAgentHostRoot } from "../../src";
import type { AgentInfo } from "../../src";
import { AGENT_INFO } from "./agent";
import type { IntegrationEnv } from "./agent";

export class AgentHostRoot extends BaseAgentHostRoot<IntegrationEnv> {
  router = this.env.AGENT_ROUTER;

  getAgentInfo(): AgentInfo {
    return AGENT_INFO;
  }
}
