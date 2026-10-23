import type { MultiAgentEnv } from "./env";
import { getHost } from "@experiments/agent-host/helpers";

const HOST_PATH = /^\/hosts\/([^/]+)\/ahp$/;

const worker: ExportedHandler<MultiAgentEnv> = {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const match = HOST_PATH.exec(path);
    const hostId = match?.[1];
    if (hostId === undefined) {
      return new Response("Not found", { status: 404 });
    }

    const stub = getHost(env.AGENT_ROUTER, hostId);

    return await stub.fetch(request);
  },
};

export default worker;

export { AgentHostConnectionRouter, AgentHostRoot, AgentHostSession } from "./durable-objects";
