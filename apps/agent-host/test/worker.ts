import { AgentHost as BaseAgentHost } from "../src/index";
import type { AgentConfig, AcpConnectionOptions } from "../src/index";
import { TEST_CONFIG } from "./config";
import type { CustomHost } from "./custom-host";
import type { AcpBackend } from "./acp-backend";

const STATUS_SWITCHING_PROTOCOLS = 101;

type TestEnv = {
  AGENT_HOST: DurableObjectNamespace<AgentHost>;
  CUSTOM_HOST: DurableObjectNamespace<CustomHost>;
  ACP_BACKEND: DurableObjectNamespace<AcpBackend>;
};

async function connectAcp({ signal }: AcpConnectionOptions): Promise<WebSocket> {
  const response = await fetch("http://agent.test/acp", {
    headers: { Upgrade: "websocket" },
    signal,
  });

  if (response.status !== STATUS_SWITCHING_PROTOCOLS || !response.webSocket) {
    throw new Error(`Agent connection failed with HTTP ${response.status}`);
  }

  return response.webSocket;
}

class AgentHost extends BaseAgentHost<TestEnv> {
  protected override getAgentConfig(): AgentConfig {
    return TEST_CONFIG;
  }
  protected override async connectAcp(options: AcpConnectionOptions): Promise<WebSocket> {
    return await connectAcp(options);
  }
}

export { AgentHost, connectAcp };

export { CustomHost } from "./custom-host";

export { AcpBackend } from "./acp-backend";

export type { TestEnv };
