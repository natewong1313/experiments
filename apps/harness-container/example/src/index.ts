import {
  HarnessContainer as BaseHarnessContainer,
  type HarnessContainerEnv,
} from "@experiments/harness-container";

type WorkspaceHarnessContainerEnv = {
  WORKSPACE_DIR: string;
} & HarnessContainerEnv;

export class HarnessContainer extends BaseHarnessContainer<Env> {
  protected override getContainerEnv(): WorkspaceHarnessContainerEnv {
    return {
      ...super.getContainerEnv(),
      WORKSPACE_DIR: this.env.WORKSPACE_DIR,
    };
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    const match = /^\/agents\/(?<agentId>[a-zA-Z0-9_-]{1,64})\/acp$/.exec(
      url.pathname,
    );

    const agentId = match?.groups?.agentId ?? null;

    if (agentId === null) {
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
