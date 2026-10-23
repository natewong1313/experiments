import { AgentHostConnectionRouter as BaseConnectionRouter } from "../../src";
import type { IntegrationEnv } from "./agent";

export class AgentHostConnectionRouter extends BaseConnectionRouter<IntegrationEnv> {
  host = this.env.AGENT_HOST;
  session = this.env.AGENT_SESSION;
}
