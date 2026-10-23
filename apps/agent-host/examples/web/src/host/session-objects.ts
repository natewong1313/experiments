import type { AgentHostSession } from "./durable-objects";

import { HOST_ID } from "../web/lib/ahp/host";
import { EVICTION_REASON } from "./debug-eviction";

type EvictableObject = { evict(): Promise<void> };

type ObjectNamespace<Stub> = {
  idFromName(name: string): Pick<DurableObjectId, "toString">;
  getByName(name: string): Stub;
};

export type SessionObjectBindings = {
  AGENT_HOST: ObjectNamespace<EvictableObject>;
  AGENT_ROUTER: ObjectNamespace<EvictableObject>;
  AGENT_SESSION: ObjectNamespace<
    EvictableObject & {
      inspectObjects(): Promise<ReturnType<AgentHostSession["inspectObjects"]>>;
    }
  >;
};

/**
 * The Durable Object classes that [wrangler.jsonc](../../wrangler.jsonc) binds, keyed by the
 * role the object plays in a session.
 */
const OBJECT_CLASS_NAMES = {
  root: "AgentHostRoot",
  session: "AgentHostSession",
  router: "AgentHostConnectionRouter",
} as const;

export type SessionObjectKind = keyof typeof OBJECT_CLASS_NAMES;

export type SessionObject = {
  kind: SessionObjectKind;
  /** The name of the Durable Object class that runs the object. */
  className: (typeof OBJECT_CLASS_NAMES)[SessionObjectKind];
  name: string;
  id: string;
  channels: string[];
};

export type SessionObjects = {
  objects: SessionObject[];
  fetchedAt: string;
};

export async function readSessionObjects(
  env: SessionObjectBindings,
  sessionId: string,
): Promise<SessionObjects> {
  const sessionName = `${HOST_ID}/${sessionId}`;
  const session = await env.AGENT_SESSION.getByName(sessionName).inspectObjects();
  if (!session.exists) {
    throw new Error("Session not found");
  }

  return {
    fetchedAt: new Date().toISOString(),
    objects: [
      {
        kind: "root",
        className: OBJECT_CLASS_NAMES.root,
        name: HOST_ID,
        id: env.AGENT_HOST.idFromName(HOST_ID).toString(),
        channels: [],
      },
      {
        kind: "session",
        className: OBJECT_CLASS_NAMES.session,
        name: sessionName,
        id: env.AGENT_SESSION.idFromName(sessionName).toString(),
        channels: [],
      },
      ...session.routers.map((router): SessionObject => ({
        kind: "router",
        className: OBJECT_CLASS_NAMES.router,
        name: router.name,
        id: env.AGENT_ROUTER.idFromName(router.name).toString(),
        channels: router.channels,
      })),
    ],
  };
}

export async function evictSessionObject(
  env: SessionObjectBindings,
  sessionId: string,
  target: Pick<SessionObject, "kind" | "name">,
): Promise<void> {
  const { objects } = await readSessionObjects(env, sessionId);
  if (!objects.some((object) => object.kind === target.kind && object.name === target.name)) {
    throw new Error("Object is no longer associated with this session");
  }

  const namespaces = {
    root: env.AGENT_HOST,
    session: env.AGENT_SESSION,
    router: env.AGENT_ROUTER,
  };

  try {
    await namespaces[target.kind].getByName(target.name).evict();
  } catch (error) {
    // Abort terminates the RPC with the reset reason instead of returning a response.
    if (!(error instanceof Error) || error.message !== EVICTION_REASON) {
      throw error;
    }

    return;
  }

  throw new Error("Object did not acknowledge eviction");
}
