import { getHost } from "../src/helpers";
import type { AgentHost } from "./host";
import type { ConnectionRouter } from "./router";
import type { AgentSession } from "./session";

export type TestEnv = {
  COORDINATORS: DurableObjectNamespace<AgentHost>;
  CONVERSATIONS: DurableObjectNamespace<AgentSession>;
  CONNECTIONS: DurableObjectNamespace<ConnectionRouter>;
};

// /hosts/{host id}/ahp
const HOST_PATH = /^\/hosts\/([^/]+)\/ahp$/;

const worker = {
  async fetch(request: Request, env: TestEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    const match = HOST_PATH.exec(path);
    const hostId = match?.[1];

    if (hostId === undefined) {
      return new Response("Not found", { status: 404 });
    }

    const stub = getHost(env.CONNECTIONS, hostId);

    return await stub.fetch(request);
  },
} satisfies ExportedHandler<TestEnv>;

export default worker;

export { AgentHost } from "./host";

export { AgentSession } from "./session";

export { ConnectionRouter } from "./router";
