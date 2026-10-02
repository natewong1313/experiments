import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { createAdaptorServer, upgradeWebSocket } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { MAX_MESSAGE_BYTES, decodeFrame, parseMessage } from "./messages.ts";
import { logEvent, logMessage } from "./logging.ts";

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
  const pid = child.pid ?? null;

  if (pid === null) {
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
  connectionId: string,
): Promise<void> {
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

  for await (const message of lines) {
    try {
      logMessage(parseMessage(message), connectionId, "agent_to_client");
    } catch (error) {
      logEvent("agent_output_invalid", {
        connectionId,
        errorType: error instanceof Error ? error.name : "Unknown",
      });
    }

    // eslint-disable-next-line no-await-in-loop
    await sendMessage(socket, message);
  }
}

function connectAgent(
  options: BridgeOptions,
  socket: WebSocket,
  release: () => void,
): () => void {
  const connectionId = randomUUID();
  const startedAt = Date.now();
  logEvent("agent_starting", {
    connectionId,
    command: options.command,
    workspace: options.workspace,
  });

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
    logEvent("agent_stopping", { connectionId, pid: child.pid });
    child.stdin.end();
    signalGroup(child, "SIGTERM");
    setTimeout(() => {
      signalGroup(child, "SIGKILL");
    }, FORCE_STOP_MS).unref();
  }

  const stderr = createInterface({ input: child.stderr, crlfDelay: Infinity });
  stderr.on("line", (message) => {
    logEvent("agent_stderr", { connectionId, pid: child.pid, message });
  });
  child.once("spawn", () => {
    logEvent("agent_started", { connectionId, pid: child.pid });
  });
  child.stdin.on("error", (error) => {
    logEvent("agent_input_failed", { connectionId, error: error.message });
    socket.close(CLOSE_AGENT_EXIT, "Agent input failed");
  });
  child.stdin.on("drain", () => {
    socket.resume();
  });
  child.once("error", (error) => {
    logEvent("agent_start_failed", { connectionId, error: error.message });
    socket.close(CLOSE_AGENT_EXIT, "Could not launch pi-acp");
  });
  child.once("close", (code, signal) => {
    logEvent("agent_exited", {
      connectionId,
      pid: child.pid,
      code,
      signal,
      elapsedMs: Date.now() - startedAt,
    });
    stop();
    release();
    socket.close(CLOSE_AGENT_EXIT, "Agent exited");
  });
  socket.on("message", (data, isBinary) => {
    if (stopping) {
      return;
    }

    if (isBinary) {
      logEvent("acp_message_rejected", {
        connectionId,
        reason: "binary_frame",
      });
      socket.close(CLOSE_BINARY, "ACP requires text messages");
      stop();

      return;
    }

    try {
      const message = parseMessage(decodeFrame(data));
      logMessage(message, connectionId, "client_to_agent");

      if (!child.stdin.write(`${JSON.stringify(message)}\n`)) {
        socket.pause();
      }
    } catch (error) {
      logEvent("acp_message_rejected", {
        connectionId,
        errorType: error instanceof Error ? error.name : "Unknown",
      });
      socket.close(CLOSE_INVALID_DATA, "Invalid ACP message");
      stop();
    }
  });
  socket.once("close", (code, reason) => {
    logEvent("controller_disconnected", {
      connectionId,
      code,
      reason: reason.toString(),
    });
    stop();
  });
  socket.once("error", (error) => {
    logEvent("controller_failed", { connectionId, error: error.message });
    stop();
  });

  async function pumpOutput(): Promise<void> {
    try {
      await forwardOutput(child, socket, connectionId);
    } catch (error) {
      logEvent("agent_output_failed", {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      socket.close(CLOSE_AGENT_EXIT, "Agent output failed");
      stop();
    }
  }

  void pumpOutput();

  return stop;
}

type Bridge = {
  server: ServerType;
  close(): Promise<void>;
};

export function createBridge(options: BridgeOptions): Bridge {
  let stopAgent: (() => void) | null = null;

  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
    verifyClient(_info, done): void {
      if (stopAgent !== null) {
        logEvent("controller_rejected", { reason: "agent_already_controlled" });
      }

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
      logEvent("bridge_closing", { controllers: sockets.clients.size });
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
