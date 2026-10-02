import handler from "@tanstack/react-start/server-entry";

const ABSENT = void 0;

const HOST_PATH = /^\/hosts\/([a-zA-Z0-9_-]{1,64})\/ahp$/;

const STATUS_UPGRADE_REQUIRED = 426;

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const [, host] = HOST_PATH.exec(url.pathname) ?? [];

    if (host !== ABSENT) {
      if (
        request.method !== "GET" ||
        request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
      ) {
        return new Response("Expected a WebSocket upgrade", {
          status: STATUS_UPGRADE_REQUIRED,
        });
      }

      return await env.AGENT_HOST.getByName(host).fetch(request);
    }

    return await handler.fetch(request);
  },
};

export default worker;

export { AgentHost } from "./agent-host";

export { HarnessContainer } from "./harness-container";
