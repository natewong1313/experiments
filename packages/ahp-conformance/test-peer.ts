import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { withCleanup } from "./cleanup";

function isTcpAddress(value: unknown): value is AddressInfo {
  return value !== null && typeof value === "object" && "port" in value;
}

async function withPeer<T>(
  onConnection: (socket: WebSocket) => void,
  run: (url: string) => Promise<T>,
): Promise<T> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  server.on("connection", onConnection);

  return await withCleanup(
    async () => {
      await new Promise<void>((resolve, reject) => {
        function cleanup(): void {
          server.off("listening", onListening);
          server.off("error", onError);
        }

        function onListening(): void {
          cleanup();
          resolve();
        }

        function onError(error: Error): void {
          cleanup();
          reject(error);
        }

        server.on("listening", onListening);
        server.on("error", onError);
      });
      const address = server.address();

      if (!isTcpAddress(address)) {
        throw new Error("Expected an ephemeral WebSocket TCP address");
      }

      return await run(`ws://127.0.0.1:${address.port}`);
    },
    async () => {
      for (const socket of server.clients) {
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
  );
}

export { withPeer };
