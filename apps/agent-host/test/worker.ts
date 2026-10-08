import { AgentHost as BaseAgentHost } from "../src/index";
import { websocketStream } from "@experiments/agent-host/helpers";
import type { AgentConfig, AcpConnectionOptions, Stream } from "../src/index";
import { TEST_CONFIG } from "./config";
import type { CustomHost } from "./custom-host";
import type { AcpBackend } from "./acp-backend";

const STATUS_SWITCHING_PROTOCOLS = 101;

export type TestEnv = {
  AGENT_HOST: DurableObjectNamespace<AgentHost>;
  CUSTOM_HOST: DurableObjectNamespace<CustomHost>;
  ACP_BACKEND: DurableObjectNamespace<AcpBackend>;
};

export async function connectAcp({ signal }: AcpConnectionOptions): Promise<Stream> {
  const response = await fetch("http://agent.test/acp", {
    headers: { Upgrade: "websocket" },
    signal,
  });

  if (response.status !== STATUS_SWITCHING_PROTOCOLS || !response.webSocket) {
    throw new Error(`Agent connection failed with HTTP ${response.status}`);
  }

  return websocketStream(response.webSocket);
}

export class AgentHost extends BaseAgentHost<TestEnv> {
  protected override getAgentConfig(): AgentConfig {
    return TEST_CONFIG;
  }
  protected override async connectAcp(options: AcpConnectionOptions): Promise<Stream> {
    return await connectAcp(options);
  }
}

export { CustomHost } from "./custom-host";

export { AcpBackend } from "./acp-backend";
