import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import { expect, it, vi } from "vitest";
import { HostStore } from "../src/state/store";
import { Peer } from "./peer";

const ROOT = "ahp-root://";

const SESSION = "ahp-session:/custom";

const DIRECTORY = "file:///custom%20workspace/%25project%231";

const CWD = "/custom workspace/%project#1";

const SECOND_SEQUENCE = 2;

async function openHost(): Promise<{
  stub: ReturnType<typeof env.CUSTOM_HOST.get>;
  peer: Peer;
}> {
  const stub = env.CUSTOM_HOST.get(env.CUSTOM_HOST.newUniqueId());

  const response = await stub.fetch("https://host/ahp", {
    headers: { Upgrade: "websocket" },
  });

  if (!response.webSocket) {
    throw new Error("Missing host WebSocket");
  }

  const peer = new Peer(response.webSocket);

  const initialized = await peer.request("initialize", {
    channel: ROOT,
    clientId: "custom-client",
    protocolVersions: [PROTOCOL_VERSION],
  });

  expect(initialized).toMatchObject({ defaultDirectory: DIRECTORY });

  return { stub, peer };
}

async function recordFor(
  stub: DurableObjectStub,
): Promise<ReturnType<HostStore["requireWithActiveOutput"]>> {
  return await runInDurableObject(stub, (instance, state) => {
    expect(instance).toBeDefined();

    return new HostStore(state).requireWithActiveOutput(SESSION);
  });
}

async function create(
  peer: Peer,
  stub: DurableObjectStub,
): Promise<ReturnType<HostStore["requireWithActiveOutput"]>> {
  await peer.request("createSession", {
    channel: SESSION,
    provider: "custom",
    workingDirectories: [DIRECTORY],
  });

  return await vi.waitFor(async () => {
    const record = await recordFor(stub);
    expect(record.session.lifecycle).toBe("ready");

    return record;
  });
}

function prompt(peer: Peer, chat: string, clientSeq = 1): void {
  peer.notify("dispatchAction", {
    channel: chat,
    clientSeq,
    action: {
      type: "chat/turnStarted",
      turnId: `turn-${clientSeq}`,
      startedAt: new Date().toISOString(),
      message: { text: "Hello", origin: { kind: "user" } },
    },
  });
}

it("uses subclass metadata, credentials, session identity, and working directory with an ACP backend", async () => {
  const { stub, peer } = await openHost();

  try {
    expect(await peer.request("subscribe", { channel: ROOT })).toMatchObject({
      snapshot: {
        state: {
          agents: [{ provider: "custom", displayName: "Custom agent" }],
        },
      },
    });
    await expect(
      peer.request("createSession", { channel: SESSION, provider: "pi" }),
    ).rejects.toThrow("Provider does not exist");
    await expect(
      peer.request("createSession", {
        channel: SESSION,
        workingDirectories: ["file:///workspace"],
      }),
    ).rejects.toThrow(`This agent uses ${DIRECTORY}`);
    const record = await create(peer, stub);
    expect(record.session).toMatchObject({
      provider: "custom",
      workingDirectories: [DIRECTORY],
    });
    const backend = env.ACP_BACKEND.getByName(record.sessionKey);
    expect(await backend.events()).toEqual([
      { kind: "connect", sessionKey: record.sessionKey },
      { kind: "new", cwd: CWD, sessionId: record.acpSession },
    ]);
    await peer.request("subscribe", { channel: record.chatUri });
    prompt(peer, record.chatUri);
    await vi.waitFor(() => {
      expect(peer.actions.some(({ action }) => action.type === "chat/turnComplete")).toBe(true);
    });
    expect(await peer.request("subscribe", { channel: record.chatUri })).toMatchObject({
      snapshot: {
        state: { turns: [{ responseParts: [{ content: "Custom reply" }] }] },
      },
    });
    await peer.request("disposeSession", { channel: SESSION });
    await vi.waitFor(async () => {
      expect(await backend.connectionCount()).toBe(0);
    });
  } finally {
    peer.close();
  }
});

it("reopens the same ACP conversation and session key after host eviction", async () => {
  const { stub, peer } = await openHost();

  try {
    const original = await create(peer, stub);
    const backend = env.ACP_BACKEND.getByName(original.sessionKey);

    const sequence = await runInDurableObject(stub, (instance, state) => {
      expect(instance).toBeDefined();

      return new HostStore(state).sequence;
    });

    await backend.closeConnections();
    await evictDurableObject(stub);
    const reopened = await recordFor(stub);
    expect(reopened.sessionKey).toBe(original.sessionKey);
    expect(reopened.acpSession).toBe(original.acpSession);
    await runInDurableObject(stub, (instance, state) => {
      expect(instance).toBeDefined();
      const store = new HostStore(state);
      expect(store.sequence).toBe(sequence);
      expect(store.readSnapshot(ROOT).state).toMatchObject({
        agents: [{ provider: "custom" }],
      });

      const row = state.storage.sql
        .exec<{ container: string }>("SELECT container FROM sessions WHERE uri = ?", SESSION)
        .one();

      expect(row.container).toBe(original.sessionKey);
    });
    await peer.request("subscribe", { channel: original.chatUri });
    prompt(peer, original.chatUri, SECOND_SEQUENCE);
    await vi.waitFor(() => {
      expect(peer.actions.some(({ action }) => action.type === "chat/turnComplete")).toBe(true);
    });
    expect(await backend.events()).toEqual([
      { kind: "connect", sessionKey: original.sessionKey },
      { kind: "new", cwd: CWD, sessionId: original.acpSession },
      { kind: "connect", sessionKey: original.sessionKey },
      { kind: "load", cwd: CWD, sessionId: original.acpSession },
      { kind: "prompt", sessionId: original.acpSession },
    ]);
    await peer.request("disposeSession", { channel: SESSION });
  } finally {
    peer.close();
  }
});

it("reports failure without creating a replacement conversation when loading is unsupported", async () => {
  const { stub, peer } = await openHost();

  try {
    const original = await create(peer, stub);
    const backend = env.ACP_BACKEND.getByName(original.sessionKey);
    await backend.setLoadSupport(false);
    await backend.closeConnections();
    await evictDurableObject(stub);
    await peer.request("subscribe", { channel: original.chatUri });
    prompt(peer, original.chatUri);
    await vi.waitFor(() => {
      expect(
        peer.actions.some(
          ({ action }) =>
            action.type === "chat/error" &&
            action.part.error.message === "Agent cannot reopen this conversation",
        ),
      ).toBe(true);
    });
    expect(await backend.events()).toEqual([
      { kind: "connect", sessionKey: original.sessionKey },
      { kind: "new", cwd: CWD, sessionId: original.acpSession },
      { kind: "connect", sessionKey: original.sessionKey },
    ]);
    const current = await recordFor(stub);
    expect(current.acpSession).toBe(original.acpSession);
    await peer.request("disposeSession", { channel: SESSION });
  } finally {
    peer.close();
  }
});
