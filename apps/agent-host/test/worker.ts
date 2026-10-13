import { routeAgentHost } from "../src";
import type { AgentHost } from "./host";
import type { AgentSession } from "./session";

export type TestEnv = {
  COORDINATORS: DurableObjectNamespace<AgentHost>;
  CONVERSATIONS: DurableObjectNamespace<AgentSession>;
};

const worker = {
  async fetch(request: Request, env: TestEnv): Promise<Response> {
    return await routeAgentHost({ request, namespace: env.COORDINATORS });
  },
} satisfies ExportedHandler<TestEnv>;

export default worker;

export { AgentHost } from "./host";

export { AgentSession } from "./session";
