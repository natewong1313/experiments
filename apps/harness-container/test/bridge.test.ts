import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import * as z from "zod";
import { createBridge } from "../container/bridge.ts";
import { parseMessage } from "../container/messages.ts";
import type { AnyMessage } from "@agentclientprotocol/sdk";
import { connectWebSocket } from "../scripts/websocket-stream.ts";

async function socketSupport(): Promise<boolean> {
  const probe = createServer();
  try {
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    await new Promise<void>((resolve) => {
      probe.close(() => {
        resolve();
      });
    });
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      return false;
    }
    throw error;
  }
}

async function setup(t: TestContext): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "harness-bridge-"));
  const bridge = createBridge({
    workspace,
    command: process.execPath,
    args: [
      "--experimental-strip-types",
      fileURLToPath(new URL("./fixture-agent.ts", import.meta.url)),
    ],
    env: process.env,
  });
  t.after(async () => {
    await bridge.close();
    await rm(workspace, { recursive: true, force: true });
  });
  bridge.server.listen(0, "127.0.0.1");
  await once(bridge.server, "listening");
  const address = bridge.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Bridge did not bind a TCP port");
  }
  return `ws://127.0.0.1:${address.port}/acp`;
}

async function read(
  reader: ReadableStreamDefaultReader<AnyMessage>,
): Promise<AnyMessage> {
  const result = await reader.read();
  if (result.done) {
    throw new Error("Connection closed before the expected response");
  }
  return result.value;
}

async function reconnect(
  url: string,
  deadline: number,
): Promise<Awaited<ReturnType<typeof connectWebSocket>>> {
  try {
    return await connectWebSocket(url);
  } catch (error) {
    if (Date.now() >= deadline) {
      throw error;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    return reconnect(url, deadline);
  }
}

const socketsAvailable = await socketSupport();
const ProcessSchema = z.object({
  protocolVersion: z.literal(1),
  pid: z.number(),
});
void describe(
  "container WebSocket bridge",
  {
    timeout: 10_000,
    skip: socketsAvailable ? false : "Sandbox denies local network listeners",
  },
  () => {
    void it("forwards updates and reverse requests while a prompt is pending, then forwards cancellation", async (t) => {
      const url = await setup(t);
      const { socket, stream } = await connectWebSocket(url);
      t.after(() => {
        socket.terminate();
      });
      const reader = stream.readable.getReader();
      const writer = stream.writable.getWriter();
      await writer.write({
        jsonrpc: "2.0",
        id: 1,
        method: "session/prompt",
        params: {},
      });
      const update = await read(reader);
      assert.equal("method" in update && update.method, "session/update");
      const permission = await read(reader);
      assert.equal(
        "method" in permission && permission.method,
        "session/request_permission",
      );
      await writer.write({
        jsonrpc: "2.0",
        id: "permission-1",
        result: { outcome: "cancelled" },
      });
      const acknowledgement = await read(reader);
      assert.deepEqual("params" in acknowledgement && acknowledgement.params, {
        permission: { outcome: "cancelled" },
      });
      await writer.write({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: {},
      });
      assert.deepEqual(await read(reader), {
        jsonrpc: "2.0",
        id: 1,
        result: { stopReason: "cancelled" },
      });
    });

    void it("rejects a second controller and allows a new controller after disconnect", async (t) => {
      const url = await setup(t);
      const first = await connectWebSocket(url);
      t.after(() => {
        first.socket.terminate();
      });
      await first.stream.writable.getWriter().write({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      });
      const initialized = await read(first.stream.readable.getReader());
      if (!("result" in initialized)) {
        throw new Error("Fixture did not initialize");
      }
      const { pid } = ProcessSchema.parse(initialized.result);
      const contender = new WebSocket(url);
      t.after(() => {
        contender.terminate();
      });
      contender.once("error", () => {
        assert.notEqual(contender.readyState, WebSocket.OPEN);
      });
      const status = await new Promise<number>((resolve) => {
        contender.once("unexpected-response", (_request, response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
          contender.terminate();
        });
      });
      assert.equal(status, 409);
      first.socket.terminate();
      await once(first.socket, "close");
      const next = await reconnect(url, Date.now() + 2000);
      t.after(() => {
        next.socket.terminate();
      });
      assert.equal(next.socket.readyState, WebSocket.OPEN);
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    });

    void it("closes malformed frames instead of injecting extra stdio messages", async (t) => {
      const url = await setup(t);
      const { socket } = await connectWebSocket(url);
      t.after(() => {
        socket.terminate();
      });
      socket.send(
        '{"jsonrpc":"2.0","method":"initialize"}\n{"jsonrpc":"2.0","method":"session/prompt"}',
      );
      const code = await new Promise<number>((resolve) => {
        socket.once("close", resolve);
      });
      assert.equal(code, 1007);
    });

    void it("serves health checks without claiming the controller slot", async (t) => {
      const url = await setup(t);
      const health = new URL(url);
      health.protocol = "http:";
      health.pathname = "/health";
      const response = await fetch(health);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
      const { socket, stream } = await connectWebSocket(url);
      t.after(() => {
        socket.terminate();
      });
      await stream.writable
        .getWriter()
        .write(parseMessage('{"jsonrpc":"2.0","id":1,"method":"initialize"}'));
      const initialized = await read(stream.readable.getReader());
      assert.equal("id" in initialized && initialized.id, 1);
    });
  },
);
