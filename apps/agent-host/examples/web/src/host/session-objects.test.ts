import { beforeEach, expect, it, vi } from "vitest";

import { HOST_ID } from "../web/lib/ahp/host";
import { EVICTION_REASON } from "./debug-eviction";
import { evictSessionObject, readSessionObjects } from "./session-objects";
import type { SessionObject, SessionObjectBindings } from "./session-objects";

type SessionObjectStub = ReturnType<SessionObjectBindings["AGENT_SESSION"]["getByName"]>;

const inspectObjects = vi.fn<SessionObjectStub["inspectObjects"]>();
const rootEvict = vi.fn<SessionObjectStub["evict"]>();
const sessionEvict = vi.fn<SessionObjectStub["evict"]>();
const routerEvict = vi.fn<SessionObjectStub["evict"]>();

const bindings = {
  inspectObjects,
  rootEvict,
  sessionEvict,
  routerEvict,
  env: {
    AGENT_HOST: {
      getByName: vi.fn<SessionObjectBindings["AGENT_HOST"]["getByName"]>(() => ({
        evict: rootEvict,
      })),
      idFromName: (name: string): Pick<DurableObjectId, "toString"> => ({
        toString: (): string => `root:${name}`,
      }),
    },
    AGENT_SESSION: {
      getByName: vi.fn<SessionObjectBindings["AGENT_SESSION"]["getByName"]>(() => ({
        inspectObjects,
        evict: sessionEvict,
      })),
      idFromName: (name: string): Pick<DurableObjectId, "toString"> => ({
        toString: (): string => `session:${name}`,
      }),
    },
    AGENT_ROUTER: {
      getByName: vi.fn<SessionObjectBindings["AGENT_ROUTER"]["getByName"]>(() => ({
        evict: routerEvict,
      })),
      idFromName: (name: string): Pick<DurableObjectId, "toString"> => ({
        toString: (): string => `router:${name}`,
      }),
    },
  } satisfies SessionObjectBindings,
};

const sessionId = "11111111-1111-4111-8111-111111111111";
const routerName = `${HOST_ID}/22222222-2222-4222-8222-222222222222`;

beforeEach(() => {
  vi.clearAllMocks();
  bindings.inspectObjects.mockResolvedValue({
    exists: true,
    routers: [{ name: routerName, channels: [`ahp-session:/${sessionId}`] }],
  });

  for (const evict of [bindings.rootEvict, bindings.sessionEvict, bindings.routerEvict]) {
    evict.mockRejectedValue(new Error(EVICTION_REASON));
  }
});

it("returns the root, session and recorded router identities", async () => {
  const snapshot = await readSessionObjects(bindings.env, sessionId);
  expect(snapshot.objects).toEqual([
    {
      kind: "root",
      className: "AgentHostRoot",
      name: HOST_ID,
      id: `root:${HOST_ID}`,
      channels: [],
    },
    {
      kind: "session",
      className: "AgentHostSession",
      name: `${HOST_ID}/${sessionId}`,
      id: `session:${HOST_ID}/${sessionId}`,
      channels: [],
    },
    {
      kind: "router",
      className: "AgentHostConnectionRouter",
      name: routerName,
      id: `router:${routerName}`,
      channels: [`ahp-session:/${sessionId}`],
    },
  ]);
});

it("rejects inspection and eviction for an absent session", async () => {
  bindings.inspectObjects.mockResolvedValue({ exists: false, routers: [] });
  await expect(readSessionObjects(bindings.env, sessionId)).rejects.toThrow("Session not found");
  await expect(
    evictSessionObject(bindings.env, sessionId, { kind: "root", name: HOST_ID }),
  ).rejects.toThrow("Session not found");
  expect(bindings.rootEvict).not.toHaveBeenCalled();
});

it("rejects objects outside the session and stale router subscriptions", async () => {
  const targets: Pick<SessionObject, "kind" | "name">[] = [
    { kind: "router", name: `${HOST_ID}/33333333-3333-4333-8333-333333333333` },
    { kind: "session", name: `${HOST_ID}/44444444-4444-4444-8444-444444444444` },
    { kind: "root", name: "55555555-5555-4555-8555-555555555555" },
    { kind: "root", name: routerName },
  ];

  await Promise.all(
    targets.map((target) =>
      expect(evictSessionObject(bindings.env, sessionId, target)).rejects.toThrow(
        "no longer associated",
      ),
    ),
  );

  expect(bindings.rootEvict).not.toHaveBeenCalled();
  expect(bindings.sessionEvict).not.toHaveBeenCalled();
  expect(bindings.routerEvict).not.toHaveBeenCalled();
});

it("evicts each object kind and accepts only the explicit reset reason", async () => {
  await evictSessionObject(bindings.env, sessionId, { kind: "root", name: HOST_ID });
  await evictSessionObject(bindings.env, sessionId, {
    kind: "session",
    name: `${HOST_ID}/${sessionId}`,
  });
  await evictSessionObject(bindings.env, sessionId, { kind: "router", name: routerName });
  expect(bindings.rootEvict).toHaveBeenCalledOnce();
  expect(bindings.sessionEvict).toHaveBeenCalledOnce();
  expect(bindings.routerEvict).toHaveBeenCalledOnce();

  bindings.routerEvict.mockRejectedValue(new Error("RPC disconnected"));
  await expect(
    evictSessionObject(bindings.env, sessionId, { kind: "router", name: routerName }),
  ).rejects.toThrow("RPC disconnected");
  bindings.routerEvict.mockResolvedValue();
  await expect(
    evictSessionObject(bindings.env, sessionId, { kind: "router", name: routerName }),
  ).rejects.toThrow("did not acknowledge");
});
