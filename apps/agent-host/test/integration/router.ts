import { AgentHostConnectionRouter as BaseConnectionRouter } from "../../src";
import type { IntegrationEnv } from "./agent";
import type { AgentHostRoot } from "./root";
import type { AgentHostSession } from "./session";

export class AgentHostConnectionRouter extends BaseConnectionRouter<
  IntegrationEnv,
  AgentHostRoot,
  AgentHostSession
> {
  host = this.env.AGENT_HOST;
  session = this.env.AGENT_SESSION;
}
