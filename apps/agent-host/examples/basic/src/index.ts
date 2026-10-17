import { getHost } from "@experiments/agent-host/helpers";

// /hosts/{host id}/ahp
const HOST_PATH = /^\/hosts\/([^/]+)\/ahp$/;

const worker: ExportedHandler<Env> = {
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

export { ConnectionRouter, AgentHost, AgentSession } from "./durable-objects";
