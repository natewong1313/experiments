import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { createHostState } from "./config";
import { expect, it, vi } from "vitest";
import {
  ChatStateSchema,
  SubscribeResultSchema,
  ReconnectResultSchema,
  type ChatState,
} from "@experiments/protocol-schemas/ahp";

import { reduceChat } from "../src/state/reducers";
import { connectPeer, type Peer } from "./peer";

const LARGE_BYTES = 100_000;
const LAST_ACTION = -1;
const SESSION = "ahp-session:/host-test";

async function snapshot(peer: Peer, chat: string): Promise<ChatState> {
  const result = SubscribeResultSchema.parse(
    await peer.request("subscribe", { channel: chat, view: { turns: 0 } }),
  );

  return ChatStateSchema.parse(result.snapshot?.state);
}

it("keeps two streaming clients, snapshots, replay and immutable resource versions equal", async () => {
  const stub = env.CUSTOM_HOST.get(env.CUSTOM_HOST.newUniqueId());
  const sender = await connectPeer(stub, "sender");
  const observer = await connectPeer(stub, "observer");
  const peers = [sender, observer];
  await sender.request("createSession", { channel: SESSION, provider: "custom" });

  const record = await vi.waitFor(async () => {
    const saved = await runInDurableObject(stub, (_instance, state) =>
      createHostState(state.storage).queries.requireMetadata(SESSION),
    );

    expect(saved.session.lifecycle).toBe("ready");

    return saved;
  });

  const chat = record.chatUri;
  const backend = env.ACP_BACKEND.getByName(record.sessionKey);
  await backend.holdPrompts();

  async function connectObserver(): Promise<Peer> {
    const peer = await connectPeer(stub, crypto.randomUUID());
    peers.push(peer);

    return peer;
  }

  const initial = await snapshot(sender, chat);
  await snapshot(observer, chat);

  try {
    sender.notify("dispatchAction", {
      channel: chat,
      clientSeq: 1,
      action: {
        type: "chat/turnStarted",
        turnId: "turn",
        startedAt: initial.modifiedAt,
        message: { text: "read", origin: { kind: "user" } },
      },
    });
    await vi.waitFor(async () => {
      expect(await backend.hasHeldPrompt()).toBe(true);
    });
    await backend.emit({
      sessionUpdate: "tool_call",
      toolCallId: "one",
      title: "One",
      status: "in_progress",
    });
    await backend.emit({
      sessionUpdate: "tool_call",
      toolCallId: "two",
      title: "Two",
      status: "in_progress",
    });
    await backend.emit({
      sessionUpdate: "tool_call_update",
      toolCallId: "one",
      content: [{ type: "content", content: { type: "text", text: "a".repeat(LARGE_BYTES) } }],
    });
    await vi.waitFor(() => {
      expect(
        sender.actions.some((item) => item.action.type === "chat/toolCallContentChanged"),
      ).toBe(true);
    });
    const cut = await snapshot(sender, chat);
    let senderMirror = initial;

    for (const envelope of sender.actions.filter((item) => item.channel === chat)) {
      senderMirror = reduceChat(senderMirror, envelope.action);
    }

    expect(senderMirror).toEqual(cut);
    await vi.waitFor(() => {
      expect(observer.actions.filter((item) => item.channel === chat)).toEqual(
        sender.actions.filter((item) => item.channel === chat),
      );
    });
    const first = cut.activeTurn?.responseParts[0];

    if (first?.kind !== "toolCall" || first.toolCall.status !== "running") {
      throw new Error("Expected running tool");
    }

    const resource = first.toolCall.content?.[0];

    if (resource?.type !== "resource") {
      throw new Error("Expected resource");
    }

    expect(
      await observer.request("resourceRead", { channel: "ahp-root://", uri: resource.uri }),
    ).toMatchObject({ data: "a".repeat(LARGE_BYTES) });
    const checkpoint = sender.actions.at(LAST_ACTION)?.serverSeq;
    observer.close();
    await backend.emit({
      sessionUpdate: "tool_call_update",
      toolCallId: "one",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "b".repeat(LARGE_BYTES) } }],
    });
    await vi.waitFor(() => {
      expect(sender.actions.some((item) => item.action.type === "chat/toolCallComplete")).toBe(
        true,
      );
    });
    const reconnected = await connectObserver();

    const replay = ReconnectResultSchema.parse(
      await reconnected.request("reconnect", {
        channel: "ahp-root://",
        clientId: "returning-client",
        lastSeenServerSeq: checkpoint ?? 0,
        subscriptions: [chat],
      }),
    );

    if (replay.type !== "replay") {
      throw new Error("Expected replay");
    }

    let resumed = cut;

    for (const envelope of replay.actions) {
      resumed = reduceChat(resumed, envelope.action);
    }

    expect(resumed).toEqual(await snapshot(sender, chat));
    expect(resumed.activeTurn?.responseParts[1]).toMatchObject({
      kind: "toolCall",
      toolCall: { status: "running" },
    });
    expect(
      await reconnected.request("resourceRead", { channel: "ahp-root://", uri: resource.uri }),
    ).toMatchObject({ data: "a".repeat(LARGE_BYTES) });
    await backend.finishPrompt();
    await vi.waitFor(() => {
      expect(sender.actions.some((item) => item.action.type === "chat/turnComplete")).toBe(true);
    });
    const final = await snapshot(sender, chat);
    expect(final.activeTurn).toBeUndefined();
    expect(await sender.request("subscribe", { channel: SESSION })).toBeDefined();
  } finally {
    await backend.finishPrompt();

    for (const peer of peers) {
      peer.close();
    }

    await backend.closeConnections();
  }
});
