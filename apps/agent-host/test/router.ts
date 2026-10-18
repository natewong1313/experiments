import { AgentHostConnectionRouter as BaseRouter } from "../src";
import type { AgentHost } from "./host";
import type { AgentSession } from "./session";
import type { TestEnv } from "./worker";

export class AgentHostConnectionRouter extends BaseRouter<TestEnv, AgentHost, AgentSession> {
  host = this.env.COORDINATORS;
  session = this.env.CONVERSATIONS;
}
