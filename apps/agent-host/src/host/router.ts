import { UUIDSchema } from "../protocol";
import type { AgentHost } from "./durable-object";

const HOST_PATH = /^\/hosts\/([^/]+)\/ahp$/;
const NOT_FOUND = 404;

export function hostIdFromRequest(request: Request): string | undefined {
  const path = new URL(request.url).pathname;
  const match = HOST_PATH.exec(path);
  const parsed = UUIDSchema.safeParse(match?.[1]);

  return parsed.success ? parsed.data : undefined;
}

type RouteOptions<Env> = { request: Request; namespace: DurableObjectNamespace<AgentHost<Env>> };

export async function routeAgentHost<Env>(options: RouteOptions<Env>): Promise<Response> {
  const hostId = hostIdFromRequest(options.request);

  if (hostId === undefined) {
    return new Response("Not found", { status: NOT_FOUND });
  }

  return await options.namespace.getByName(hostId).fetch(options.request);
}
