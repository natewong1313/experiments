import { AgentHost } from "../src/index";
import { websocketStream } from "@experiments/agent-host/helpers";
import type { AgentConfig, AcpConnectionOptions, Stream } from "../src/index";
import type { AcpBackend } from "./acp-backend";

const STATUS_SWITCHING_PROTOCOLS = 101;

type CustomEnv = { ACP_BACKEND: DurableObjectNamespace<AcpBackend> };

export class CustomHost extends AgentHost<CustomEnv> {
  private readonly config: AgentConfig = {
    agent: {
      provider: "custom",
      displayName: "Custom agent",
      description: "An ACP backend",
      models: [],
    },
    cwd: "/custom workspace/%project#1",
  };

  protected override getAgentConfig(): AgentConfig {
    return this.config;
  }

  protected override async connectAcp({
    sessionKey,
    signal,
  }: AcpConnectionOptions): Promise<Stream> {
    const response = await this.env.ACP_BACKEND.getByName(sessionKey).fetch("https://custom/acp", {
      headers: {
        Upgrade: "websocket",
        Authorization: "Bearer test-token",
        "X-Session-Key": sessionKey,
      },
      signal,
    });

    if (response.status !== STATUS_SWITCHING_PROTOCOLS || !response.webSocket) {
      throw new Error(`Custom agent connection failed with HTTP ${response.status}`);
    }

    return websocketStream(response.webSocket);
  }
}
