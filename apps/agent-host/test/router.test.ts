import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { ActionEnvelopeSchema } from "@experiments/protocol-schemas/ahp";
import type { DispatchActionParams, JsonValue } from "@experiments/protocol-schemas/ahp";
import { connectPeer, openPeer } from "./peer";

const invalidDispatches: JsonValue[] = [
  { channel: "ahp-root://", clientSeq: 1, action: { type: "unknown/action", payload: true } },
  { channel: "ahp-root://", clientSeq: 1, action: { type: "chat/turnStarted", turnId: "turn" } },
  { channel: "ahp-root://", clientSeq: 1, action: null },
  {
    channel: "ahp-root://",
    clientSeq: 1,
    action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 },
    extra: true,
  },
  {
    channel: "ahp-root://",
    clientSeq: 1,
    action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 },
    _meta: false,
  },
  { channel: 1, clientSeq: 1, action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 } },
  { clientSeq: 1, action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 } },
  {
    channel: "ahp-root://",
    clientSeq: -1,
    action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 },
  },
  {
    channel: "ahp-root://",
    clientSeq: 0.5,
    action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 },
  },
  {
    channel: "ahp-root://",
    clientSeq: Number.MAX_SAFE_INTEGER + 1,
    action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 },
  },
  { channel: "ahp-root://", clientSeq: 1 },
];

it.each(invalidDispatches)("drops invalid dispatch parameters: %j", async (params) => {
  const peer = await connectPeer(crypto.randomUUID());
  const receivedBeforeDispatch = peer.messages.length;
  peer.notifyRaw("dispatchAction", params);

  expect(await peer.request("ping", { channel: "ahp-root://" })).toBeNull();
  expect(peer.messages).toHaveLength(receivedBeforeDispatch + 1);
});

it("drops dispatches before initialization", async () => {
  const peer = await openPeer(crypto.randomUUID());
  peer.notify("dispatchAction", {
    channel: "ahp-root://",
    clientSeq: 1,
    action: { type: "chat/turnCancelled", turnId: "turn", duration: 0 },
  });

  expect(await peer.request("ping", { channel: "ahp-root://" })).toBeNull();
  expect(peer.messages).toHaveLength(1);
});

it("sends service rejections only to the sender with increasing sequences", async () => {
  const hostId = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  const sender = await connectPeer(hostId, clientId);
  const observer = await connectPeer(hostId);
  await observer.request("subscribe", { channel: "ahp-root://" });

  const actions = [
    { type: "chat/turnCancelled", turnId: "first", duration: 0 },
    { type: "chat/turnCancelled", turnId: "turn", duration: 0 },
  ] satisfies DispatchActionParams["action"][];

  for (const action of actions) {
    sender.notify("dispatchAction", { channel: "ahp-root://", clientSeq: 1, action });
  }

  await vi.waitFor(() => {
    expect(sender.actions).toHaveLength(actions.length);
  });

  const first = ActionEnvelopeSchema.parse(sender.actions[0]);
  const second = ActionEnvelopeSchema.parse(sender.actions[1]);

  expect(first.action).toEqual(actions[0]);
  expect(second.action).toEqual(actions[1]);
  expect(first.origin).toEqual({ clientId, clientSeq: 1 });
  expect(second.origin).toEqual({ clientId, clientSeq: 1 });
  expect(first.serverSeq).toBe(1);
  expect(second.serverSeq).toBe(first.serverSeq + 1);
  expect(first.rejectionReason).toBe("Actions must target a chat channel");
  expect(second.rejectionReason).toBe("Actions must target a chat channel");
  await observer.request("ping", { channel: "ahp-root://" });
  expect(observer.actions).toEqual([]);
});

it("refuses a router that was not addressed by name", async () => {
  const stub = env.CONNECTIONS.get(env.CONNECTIONS.newUniqueId());
  const upgrade = new Request("https://host/", { headers: { Upgrade: "websocket" } });

  await expect(stub.fetch(upgrade)).rejects.toThrow("ConnectionRouter must be addressed by name");
});
