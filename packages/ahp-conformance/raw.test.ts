import {
  JsonRpcReplySchema,
  JsonRpcRequestSchema,
  type ActionEnvelope,
} from "@experiments/protocol-schemas";
import { describe, expect, test } from "vitest";
import { AhpConnection } from "./raw";
import { withPeer } from "./test-peer";

const CHAT = "ahp-chat:/raw-harness";

function delta(content: string, serverSeq = 700): ActionEnvelope {
  return {
    channel: CHAT,
    action: {
      type: "chat/delta",
      turnId: "turn-selected",
      partId: "part-selected",
      content,
    },
    serverSeq,
    origin: { clientId: "sender", clientSeq: 4 },
  };
}

describe("raw AHP connection over WebSocket", () => {
  test("replays a wrapped action received before the waiter exists", async () => {
    const envelope = delta("already received");
    await withPeer(
      (socket) => {
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "action",
            params: envelope,
          }),
        );
        socket.on("message", (data) => {
          const request = JsonRpcRequestSchema.parse(
            JSON.parse(data.toString()),
          );
          socket.send(
            JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }),
          );
        });
      },
      async (url) => {
        const connection = await AhpConnection.open(url);
        try {
          await connection.request("barrier", {});
          const received = await connection.waitForAction(CHAT, "chat/delta", {
            after: 0,
            timeoutMs: 1000,
          });
          expect(received).toEqual(envelope);
          expect(connection.checkpoint).toBe(2);
          expect(() => {
            received.action.type = "chat/activityChanged";
          }).toThrow(TypeError);
          const replayed = await connection.waitForAction(CHAT, "chat/delta", {
            after: 0,
            timeoutMs: 1000,
          });
          expect(replayed).toEqual(envelope);
        } finally {
          await connection.close();
        }
      },
    );
  });

  test("excludes older actions and selects the intended origin, turn and part after a checkpoint", async () => {
    await withPeer(
      (socket) => {
        socket.on("message", (data) => {
          const request = JsonRpcRequestSchema.parse(
            JSON.parse(data.toString()),
          );
          const envelopes =
            request.method === "old"
              ? [delta("old matching action")]
              : [
                  {
                    ...delta("foreign origin"),
                    origin: { clientId: "other", clientSeq: 4 },
                  },
                  {
                    ...delta("wrong turn"),
                    action: { ...delta("").action, turnId: "turn-other" },
                  },
                  {
                    ...delta("wrong part"),
                    action: { ...delta("").action, partId: "part-other" },
                  },
                  delta("selected new action"),
                ];
          for (const envelope of envelopes) {
            socket.send(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "action",
                params: envelope,
              }),
            );
          }
          socket.send(
            JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }),
          );
        });
      },
      async (url) => {
        const connection = await AhpConnection.open(url);
        try {
          await connection.request("old", {});
          const after = connection.checkpoint;
          const [selected] = await Promise.all([
            connection.waitForAction(CHAT, "chat/delta", {
              after,
              timeoutMs: 1000,
              predicate: (envelope) =>
                envelope.origin?.clientId === "sender" &&
                envelope.origin.clientSeq === 4 &&
                envelope.action.type === "chat/delta" &&
                envelope.action.turnId === "turn-selected" &&
                envelope.action.partId === "part-selected",
            }),
            connection.request("new", {}),
          ]);
          expect(selected).toEqual(delta("selected new action"));
        } finally {
          await connection.close();
        }
      },
    );
  });

  test("rejects checkpoints outside the received transcript", async () => {
    await withPeer(
      (socket) => {
        socket.on("message", (data) => {
          const request = JsonRpcRequestSchema.parse(
            JSON.parse(data.toString()),
          );
          socket.send(
            JSON.stringify({ jsonrpc: "2.0", id: request.id, result: {} }),
          );
        });
      },
      async (url) => {
        const connection = await AhpConnection.open(url);
        try {
          await connection.request("barrier", {});
          const checkpoints = [
            -1,
            0.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            connection.checkpoint + 1,
          ];
          await Promise.all(
            checkpoints.map((after) =>
              expect(
                connection.waitForAction(CHAT, "chat/delta", {
                  after,
                  timeoutMs: 1000,
                }),
              ).rejects.toThrow(/Invalid receive checkpoint/),
            ),
          );
        } finally {
          await connection.close();
        }
      },
    );
  });

  test("demultiplexes reverse requests, notifications, actions and out-of-order replies", async () => {
    const reverseReply = Promise.withResolvers<unknown>();
    await withPeer(
      (socket) => {
        const requests: { id: number | string; method: string }[] = [];
        socket.on("message", (data) => {
          const value: unknown = JSON.parse(data.toString());
          const reply = JsonRpcReplySchema.safeParse(value);
          if (reply.success) {
            reverseReply.resolve(reply.data);
            return;
          }
          requests.push(JsonRpcRequestSchema.parse(value));
          if (requests.length !== 2) {
            return;
          }
          const [first, second] = requests;
          if (!first || !second) {
            throw new Error("Expected both concurrent requests");
          }
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "notify/sessionListChanged",
              params: { channel: "ahp-root://" },
            }),
          );
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              method: "action",
              params: delta("interleaved"),
            }),
          );
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: first.id,
              method: "resourceRead",
              params: { uri: "file:///not-served" },
            }),
          );
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: second.id,
              result: { value: "second-result" },
            }),
          );
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: first.id,
              result: { value: "first-result" },
            }),
          );
        });
      },
      async (url) => {
        const connection = await AhpConnection.open(url);
        try {
          const after = connection.checkpoint;
          const [first, second] = await Promise.all([
            connection.request("first", {}),
            connection.request("second", {}),
          ]);
          expect(first).toMatchObject({ result: { value: "first-result" } });
          expect(second).toMatchObject({ result: { value: "second-result" } });
          expect(await reverseReply.promise).toMatchObject({
            id: first.id,
            error: { code: -32_601 },
          });
          expect(
            await connection.waitForAction(CHAT, "chat/delta", {
              after,
              timeoutMs: 1000,
            }),
          ).toEqual(delta("interleaved"));
          expect(
            connection.events.map((event) => ({
              index: event.index,
              kind: event.kind,
            })),
          ).toEqual([
            { index: 1, kind: "notification" },
            { index: 2, kind: "action" },
            { index: 3, kind: "request" },
            { index: 4, kind: "reply" },
            { index: 5, kind: "reply" },
          ]);
          const reverse = connection.events.find(
            (event) => event.kind === "request",
          );
          expect(reverse).toMatchObject({
            message: {
              method: "resourceRead",
              params: { uri: "file:///not-served" },
            },
          });
        } finally {
          await connection.close();
        }
      },
    );
  });
});

describe("raw AHP connection failures", () => {
  test.each([
    { name: "malformed JSON", frame: "{", error: /not JSON/ },
    {
      name: "invalid action",
      frame: JSON.stringify({
        jsonrpc: "2.0",
        method: "action",
        params: {
          ...delta("bad"),
          action: { type: "chat/delta", turnId: "turn-selected" },
        },
      }),
      error: /Malformed AHP action/,
    },
    {
      name: "unwrapped envelope",
      frame: JSON.stringify(delta("unwrapped")),
      error: /Malformed JSON-RPC message/,
    },
    {
      name: "invalid wire wrapper",
      frame: JSON.stringify({
        jsonrpc: "1.0",
        method: "action",
        params: delta("bad version"),
      }),
      error: /Malformed JSON-RPC message/,
    },
    {
      name: "binary frame",
      frame: Buffer.from('{"jsonrpc":"2.0"}'),
      error: /not a text frame/,
    },
  ])(
    "fails pending and future operations on $name",
    async ({ frame, error }) => {
      await withPeer(
        (socket) => {
          let requests = 0;
          socket.on("message", () => {
            requests += 1;
            if (requests === 2) {
              socket.send(frame);
            }
          });
        },
        async (url) => {
          const connection = await AhpConnection.open(url);
          try {
            const outcomes = await Promise.allSettled([
              connection.waitForAction(CHAT, "chat/delta", {
                after: 0,
                timeoutMs: 1000,
              }),
              connection.request("first", {}),
              connection.request("second", {}),
            ]);
            for (const outcome of outcomes) {
              expect(outcome).toMatchObject({
                status: "rejected",
                reason: { message: expect.stringMatching(error) },
              });
            }
            await expect(connection.request("later", {})).rejects.toThrow(
              error,
            );
            await expect(
              connection.waitForAction(CHAT, "chat/delta", {
                after: 0,
                timeoutMs: 1000,
              }),
            ).rejects.toThrow(error);
            expect(() => {
              connection.notify("dispatchAction", {});
            }).toThrow(error);
            expect(connection.events).toMatchObject([
              {
                index: 1,
                kind: "invalid",
                raw: typeof frame === "string" ? frame : "[non-text frame]",
                error: { message: expect.stringMatching(error) },
              },
            ]);
          } finally {
            await connection.close();
          }
        },
      );
    },
  );

  test.each(["normal", "abrupt"])(
    "settles pending and future operations after %s closure",
    async (mode) => {
      await withPeer(
        (socket) => {
          let requests = 0;
          socket.on("message", () => {
            requests += 1;
            if (requests === 2) {
              if (mode === "normal") {
                socket.close(1000, "peer finished");
              } else {
                socket.terminate();
              }
            }
          });
        },
        async (url) => {
          const connection = await AhpConnection.open(url);
          try {
            const closed = connection.waitForClose(1000);
            const outcomes = await Promise.allSettled([
              connection.waitForAction(CHAT, "chat/delta", {
                after: 0,
                timeoutMs: 1000,
              }),
              connection.request("first", {}),
              connection.request("second", {}),
            ]);
            for (const outcome of outcomes) {
              expect(outcome).toMatchObject({
                status: "rejected",
                reason: { message: expect.stringMatching(/Connection closed/) },
              });
            }
            expect(await closed).toBe(true);
            await expect(connection.request("later", {})).rejects.toThrow(
              /Connection closed/,
            );
            await expect(
              connection.waitForAction(CHAT, "chat/delta", {
                after: 0,
                timeoutMs: 1000,
              }),
            ).rejects.toThrow(/Connection closed/);
          } finally {
            await Promise.all([connection.close(), connection.close()]);
          }
        },
      );
    },
  );

  test("observes closure even after receiving an unsupported-version error reply", async () => {
    await withPeer(
      (socket) => {
        socket.on("message", (data) => {
          const request = JsonRpcRequestSchema.parse(
            JSON.parse(data.toString()),
          );
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              error: {
                code: -32_005,
                message: "Unsupported protocol version",
                data: { supportedVersions: ["0.9.0"] },
              },
            }),
          );
          socket.close(1002, "unsupported version");
        });
      },
      async (url) => {
        const connection = await AhpConnection.open(url);
        try {
          const reply = await connection.request("initialize", {
            protocolVersions: ["99.0.0"],
          });
          expect(reply).toMatchObject({ error: { code: -32_005 } });
          expect(await connection.waitForClose(1000)).toBe(true);
          expect(await connection.waitForClose(1000)).toBe(true);
          await expect(connection.request("ping", {})).rejects.toThrow(
            /Connection closed/,
          );
        } finally {
          await connection.close();
        }
      },
    );
  });

  test("fails rather than discarding evidence when its transcript overflows", async () => {
    await withPeer(
      (socket) => {
        socket.on("message", () => {
          const frame = JSON.stringify({
            jsonrpc: "2.0",
            method: "notify/sessionListChanged",
            params: { channel: "ahp-root://" },
          });
          for (let index = 0; index < 10_001; index += 1) {
            socket.send(frame);
          }
        });
      },
      async (url) => {
        const connection = await AhpConnection.open(url);
        try {
          const outcomes = await Promise.allSettled([
            connection.waitForAction(CHAT, "chat/delta", {
              after: 0,
              timeoutMs: 3000,
            }),
            connection.request("overflow", {}),
          ]);
          for (const outcome of outcomes) {
            expect(outcome).toMatchObject({
              status: "rejected",
              reason: { message: expect.stringMatching(/recorder overflow/) },
            });
          }
          expect(connection.events).toHaveLength(10_000);
          expect(connection.events.at(-1)).toMatchObject({
            index: 10_000,
            kind: "notification",
          });
          expect(connection.checkpoint).toBe(10_001);
          await expect(connection.request("later", {})).rejects.toThrow(
            /recorder overflow/,
          );
          await expect(
            connection.waitForAction(CHAT, "chat/delta", {
              after: 0,
              timeoutMs: 1000,
            }),
          ).rejects.toThrow(/recorder overflow/);
        } finally {
          await connection.close();
        }
      },
    );
  });
});
