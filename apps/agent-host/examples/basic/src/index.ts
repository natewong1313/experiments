const STATUS_NOT_FOUND = 404;

const STATUS_UPGRADE_REQUIRED = 426;

const HOST_PATH = /^\/hosts\/([a-zA-Z0-9_-]{1,64})\/ahp$/;

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    const match = HOST_PATH.exec(url.pathname);
    const [, host] = match ?? [];

    if (host === void 0) {
      return new Response("Not found", { status: STATUS_NOT_FOUND });
    }

    if (
      request.method !== "GET" ||
      request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
    ) {
      return new Response("Expected a WebSocket upgrade", {
        status: STATUS_UPGRADE_REQUIRED,
      });
    }

    return await env.AGENT_HOST.getByName(host).fetch(request);
  },
};

export { worker as default };

export { AgentHost } from "./agent-host";

export { PiAgent } from "./pi-agent";
