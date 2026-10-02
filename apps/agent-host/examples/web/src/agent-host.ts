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
        description: "Pi through the harness container",
        models: [],
      },
      cwd: this.env.WORKSPACE_DIR,
    };
  }

  protected override async connectAcp({
    sessionKey,
    signal,
  }: AcpConnectionOptions): Promise<WebSocket> {
    const response = await this.env.HARNESS_CONTAINER.getByName(
      sessionKey,
    ).fetch("https://agent/acp", { headers: { Upgrade: "websocket" }, signal });

    const socket = response.webSocket;

    if (response.status !== STATUS_SWITCHING_PROTOCOLS || !socket) {
      throw new Error(`Agent connection failed with HTTP ${response.status}`);
    }

    return socket;
  }
}

export { AgentHost };
