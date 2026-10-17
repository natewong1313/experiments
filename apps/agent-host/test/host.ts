import { AgentHost as BaseHost } from "../src";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import type { AgentSession } from "./session";
import type { ConnectionRouter } from "./router";
import type { TestEnv } from "./worker";

export class AgentHost extends BaseHost<TestEnv, ConnectionRouter, AgentSession> {
  router = this.env.CONNECTIONS;
  session = this.env.CONVERSATIONS;

  protected getAgentInfo(): AHPAgentInfo {
    return {
      provider: "test",
      displayName: "Test",
      description: "In-process ACP agent",
      models: [],
    };
  }
}
