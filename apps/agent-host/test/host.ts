import { AgentHost as BaseHost } from "../src";
import type { AgentInfo } from "@microsoft/agent-host-protocol";
import type { TestEnv } from "./worker";
import type { AgentSession } from "./session";

export class AgentHost extends BaseHost<TestEnv> {
  protected getAgentInfo(): AgentInfo {
    return {
      provider: "test",
      displayName: "Test",
      description: "In-process ACP agent",
      models: [],
    };
  }

  protected getSessionNamespace(): DurableObjectNamespace<AgentSession> {
    return this.env.CONVERSATIONS;
  }
}
