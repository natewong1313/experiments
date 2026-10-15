import { AgentHost as BaseAgentHost } from "@experiments/agent-host";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import type { AgentSession } from "./agent-session";

export class AgentHost extends BaseAgentHost<Env> {
  protected getAgentInfo(): AHPAgentInfo {
    return { provider: "pi", displayName: "Pi", description: "Pi coding agent", models: [] };
  }

  protected getSessionNamespace(): DurableObjectNamespace<AgentSession> {
    return this.env.AGENT_SESSION;
  }
}
