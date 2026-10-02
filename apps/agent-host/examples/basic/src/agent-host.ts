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
    const options = { headers: { Upgrade: "websocket" }, signal };
    let response: Response;
    if (this.env.ACP_URL === "") {
      response = await this.env.HARNESS_CONTAINER.getByName(sessionKey).fetch(
        "https://agent/acp",
        options,
      );
    } else {
      const url = new URL(this.env.ACP_URL);
      if (url.protocol === "ws:") {
        url.protocol = "http:";
      }
      if (url.protocol === "wss:") {
        url.protocol = "https:";
      }
      response = await fetch(url, options);
    }
    const socket = response.webSocket;
    if (response.status !== STATUS_SWITCHING_PROTOCOLS || !socket) {
      throw new Error(`Agent connection failed with HTTP ${response.status}`);
    }
    return socket;
  }
}

export { AgentHost };
