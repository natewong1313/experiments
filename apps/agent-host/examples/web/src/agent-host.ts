import { AgentHost as BaseAgentHost } from "@experiments/agent-host";
import type {
  AgentConfig,
  AcpConnectionOptions,
} from "@experiments/agent-host";

const STATUS_SWITCHING_PROTOCOLS = 101;

class AgentHost extends BaseAgentHost<Env> {
  protected override getAgentConfig(): AgentConfig {
    return {
      agent: {
        provider: "pi",
        displayName: "Pi",
        description: "Pi in a Durable Object",
        models: [],
      },
      cwd: this.env.WORKSPACE_DIR,
    };
  }

  protected override async connectAcp({
    sessionKey,
    signal,
  }: AcpConnectionOptions): Promise<WebSocket> {
    const response = await this.env.PI_AGENT.getByName(sessionKey).fetch(
      "https://agent/acp",
      { headers: { Upgrade: "websocket" }, signal },
    );

    const socket = response.webSocket;

    if (response.status !== STATUS_SWITCHING_PROTOCOLS || !socket) {
      throw new Error(`Agent connection failed with HTTP ${response.status}`);
    }

    return socket;
  }
}

export { AgentHost };
