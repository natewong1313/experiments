import { once } from "node:events";
import {
  ChatStateSchema,
  type ChatState,
  JsonRpcRequestSchema,
  SessionStateSchema,
  type SessionState,
} from "@experiments/protocol-schemas";
import { describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { chatSnapshot, initialized, VERSION, withClient } from "./client";
import { isWireRecord } from "./guards";
import { withPeer } from "./test-peer";

const SESSION_URI = "ahp-session:/typed-fixture";

const FIRST_CHAT = "ahp-chat:/typed-fixture/first";

const DEFAULT_CHAT = "ahp-chat:/typed-fixture/default";

function serveCatalogue(socket: WebSocket, defaultChat?: string): void {
  const chats = [
    {
      resource: FIRST_CHAT,
      title: "First chat",
      status: 0,
      modifiedAt: "2026-09-30T00:00:00Z",
    },
    {
      resource: DEFAULT_CHAT,
      title: "Selected default",
      status: 0,
      modifiedAt: "2026-09-30T00:00:00Z",
    },
  ];

  const input = {
    provider: "fixture",
    title: "Fixture session",
    status: 0,
    lifecycle: "ready",
    activeClients: [],
    chats,
  };

  const session = SessionStateSchema.parse(
    defaultChat ? { ...input, defaultChat } : input,
  );

  const states: Record<string, ChatState | SessionState> = Object.fromEntries(
    chats.map((chat) => [
      chat.resource,
      ChatStateSchema.parse({ ...chat, turns: [] }),
    ]),
  );

  states[SESSION_URI] = session;

  socket.on("message", (data) => {
    const request = JsonRpcRequestSchema.parse(JSON.parse(data.toString()));

    if (request.method === "initialize") {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { protocolVersion: VERSION, serverSeq: 0, snapshots: [] },
        }),
      );

      return;
    }

    const { params } = request;

    const channel = isWireRecord(params) ? `${params.channel}` : null;

    const state = channel === null ? null : states[channel];

    if (request.method === "subscribe" && state) {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { snapshot: { resource: channel, fromSeq: 0, state } },
        }),
      );

      return;
    }

    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32_602, message: "Unknown fixture request or channel" },
      }),
    );
  });
}

describe("typed client harness", () => {
  test("subscribes to the advertised default even when it is not the first chat", async () => {
    await withPeer(
      (socket) => serveCatalogue(socket, DEFAULT_CHAT),
      async (url) => {
        await withClient(async (client) => {
          await initialized(client);
          const chat = await chatSnapshot(client, SESSION_URI);
          expect(chat.uri).toBe(DEFAULT_CHAT);
          expect(chat.state.title).toBe("Selected default");
        }, url);
      },
    );
  });

  test("rejects an advertised default that is absent from the chat catalogue", async () => {
    await withPeer(
      (socket) => serveCatalogue(socket, "ahp-chat:/missing"),
      async (url) => {
        await withClient(async (client) => {
          await initialized(client);
          await expect(chatSnapshot(client, SESSION_URI)).rejects.toThrow(
            /default chat.*catalogue/i,
          );
        }, url);
      },
    );
  });

  test("uses the first listed chat only when no default is advertised", async () => {
    await withPeer(
      (socket) => serveCatalogue(socket),
      async (url) => {
        await withClient(async (client) => {
          await initialized(client);
          const chat = await chatSnapshot(client, SESSION_URI);
          expect(chat.uri).toBe(FIRST_CHAT);
          expect(chat.state.title).toBe("First chat");
        }, url);
      },
    );
  });

  test("closes the socket after a scenario failure without replacing the failure", async () => {
    let closed: Promise<number> | undefined;
    const failure = new Error("Scenario failed after initialize");
    await withPeer(
      (socket) => {
        closed = once(socket, "close").then(() => socket.readyState);
        serveCatalogue(socket);
      },
      async (url) => {
        await expect(
          withClient(async (client) => {
            await initialized(client);
            throw failure;
          }, url),
        ).rejects.toBe(failure);

        if (!closed) {
          throw new Error("Fixture peer was never connected");
        }

        expect(await closed).toBe(WebSocket.CLOSED);
      },
    );
  });
});
