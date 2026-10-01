import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { createAdaptorServer, upgradeWebSocket } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import {
  MAX_MESSAGE_BYTES,
  decodeFrame,
  normalizeMessage,
} from "./messages.ts";

const FORCE_STOP_MS = 2000;
const CLOSE_INVALID_DATA = 1007;
const CLOSE_BINARY = 1003;
const CLOSE_AGENT_EXIT = 1011;
const STATUS_CONFLICT = 409;
const STATUS_UPGRADE_REQUIRED = 426;

type BridgeOptions = {
  workspace: string;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

function signalGroup(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
): void {
  const { pid } = child;
  if (typeof pid !== "number") {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ESRCH"
    )) {
      throw error;
    }
  }
}

async function sendMessage(socket: WebSocket, message: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.send(message, { binary: false }, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function forwardOutput(
  child: ChildProcessWithoutNullStreams,
  socket: WebSocket,
): Promise<void> {
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const message of lines) {
    // eslint-disable-next-line no-await-in-loop
    await sendMessage(socket, message);
  }
}

function connectAgent(
  options: BridgeOptions,
  socket: WebSocket,
  release: () => void,
): () => void {
  const child = spawn(options.command, options.args, {
    cwd: options.workspace,
    env: options.env,
    stdio: "pipe",
    detached: true,
  });
  let stopping = false;
  function stop(): void {
    if (stopping) {
      return;
    }
    stopping = true;
    child.stdin.end();
    signalGroup(child, "SIGTERM");
    setTimeout(() => {
      signalGroup(child, "SIGKILL");
    }, FORCE_STOP_MS).unref();
  }
  child.stderr.resume();
  child.stdin.on("error", () => {
    socket.close(CLOSE_AGENT_EXIT, "Agent input failed");
  });
  child.stdin.on("drain", () => {
    socket.resume();
  });
  child.once("error", () => {
    socket.close(CLOSE_AGENT_EXIT, "Could not launch pi-acp");
  });
  child.once("close", () => {
    stop();
    release();
    socket.close(CLOSE_AGENT_EXIT, "Agent exited");
  });
  socket.on("message", (data, isBinary) => {
    if (stopping) {
      return;
    }
    if (isBinary) {
      socket.close(CLOSE_BINARY, "ACP requires text messages");
      stop();
      return;
    }
    try {
      const message = normalizeMessage(decodeFrame(data));
      if (!child.stdin.write(`${message}\n`)) {
        socket.pause();
      }
    } catch {
      socket.close(CLOSE_INVALID_DATA, "Invalid ACP message");
      stop();
    }
  });
  socket.once("close", stop);
  socket.once("error", stop);
  async function pumpOutput(): Promise<void> {
    try {
      await forwardOutput(child, socket);
    } catch {
      socket.close(CLOSE_AGENT_EXIT, "Agent output failed");
      stop();
    }
  }
  void pumpOutput();
  return stop;
}

export function createBridge(options: BridgeOptions): {
  server: ServerType;
  close(): Promise<void>;
} {
  let stopAgent: (() => void) | null = null;
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient(_info, done): void {
      done(
        stopAgent === null,
        STATUS_CONFLICT,
        "Agent already has a controller",
      );
    },
  });
  sockets.on("connection", (socket) => {
    function release(): void {
      stopAgent = null;
    }
    stopAgent = connectAgent(options, socket, release);
  });
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get(
    "/acp",
    upgradeWebSocket(() => ({})),
    (c) => c.text("Expected a WebSocket upgrade", STATUS_UPGRADE_REQUIRED),
  );
  const server = createAdaptorServer({
    fetch: app.fetch,
    websocket: { server: sockets },
  });
  return {
    server,
    async close(): Promise<void> {
      stopAgent?.();
      for (const socket of sockets.clients) {
        socket.terminate();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
