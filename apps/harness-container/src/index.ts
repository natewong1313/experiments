const worker = {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    const match = /^\/agents\/([a-zA-Z0-9_-]{1,64})\/acp$/.exec(url.pathname);
    const [, agentId] = match ?? [];
    if (typeof agentId !== "string") {
      return new Response("Not found", { status: 404 });
    }
    if (
      request.method !== "GET" ||
      request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
    ) {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    return env.HARNESS_CONTAINER.getByName(agentId).fetch(request);
  },
} satisfies ExportedHandler<Env>;

export default worker;
export { HarnessContainer } from "./harness-container";
