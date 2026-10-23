import serverEntry from "@tanstack/react-start/server-entry";
import { getHost } from "@experiments/agent-host/helpers";

// /hosts/{host id}/ahp
const HOST_PATH = /^\/hosts\/([^/]+)\/ahp$/;

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const match = HOST_PATH.exec(path);
    const hostId = match?.[1];
    if (hostId === undefined) {
      return await serverEntry.fetch(request);
    }

    const stub = getHost(env.AGENT_ROUTER, hostId);

    return await stub.fetch(request);
  },
};

export default worker;

export { AgentHostConnectionRouter, AgentHostRoot, AgentHostSession } from "./host/durable-objects";
