import { AgentHostConnectionRouter as BaseRouter } from "../src";
import type { TestEnv } from "./worker";

export class AgentHostConnectionRouter extends BaseRouter<TestEnv> {
  host = this.env.COORDINATORS;
  session = this.env.CONVERSATIONS;
}
