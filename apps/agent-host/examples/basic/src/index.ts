import { routeAgentHost } from "@experiments/agent-host";

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    if (new URL(request.url).pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return await routeAgentHost({ request, namespace: env.AGENT_HOST });
  },
};

export default worker;

export { AgentHost } from "./agent-host";

export { AgentSession } from "./agent-session";
