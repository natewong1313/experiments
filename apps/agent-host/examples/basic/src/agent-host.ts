import { AgentHost as BaseAgentHost } from "@experiments/agent-host";
import { websocketStream } from "@experiments/agent-host/helpers";
import type { AgentConfig, AcpConnectionOptions, Stream } from "@experiments/agent-host";

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
  }: AcpConnectionOptions): Promise<Stream> {
    const options = { headers: { Upgrade: "websocket" }, signal };
    let response: Response;

    if (this.env.ACP_URL === "") {
      response = await this.env.PI_AGENT.getByName(sessionKey).fetch("https://agent/acp", options);
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

    return websocketStream(socket);
  }
}

export { AgentHost };
