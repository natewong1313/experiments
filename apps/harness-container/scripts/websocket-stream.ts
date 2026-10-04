import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";
import { WebSocket } from "ws";
import { decodeFrame, parseMessage } from "../container/messages.ts";

export async function connectWebSocket(
  url: string,
): Promise<{ socket: WebSocket; stream: Stream }> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const readable: ReadableStream<AnyMessage> = new ReadableStream({
    start(controller): void {
      let ended = false;
      socket.on("message", (data, binary) => {
        if (ended) {
          return;
        }
        try {
          if (binary) {
            throw new Error("ACP requires WebSocket text messages");
          }
          const text = decodeFrame(data);
          const message = parseMessage(text);
          controller.enqueue(message);
        } catch (error) {
          ended = true;
          controller.error(error);
          socket.terminate();
        }
      });
      socket.once("close", () => {
        if (!ended) {
          ended = true;
          controller.close();
        }
      });
      socket.once("error", (error) => {
        if (!ended) {
          ended = true;
          controller.error(error);
        }
      });
    },
    cancel(): void {
      socket.close();
    },
  });
  const writable: WritableStream<AnyMessage> = new WritableStream({
    async write(message): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        socket.send(JSON.stringify(message), { binary: false }, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
    close(): void {
      socket.close();
    },
    abort(): void {
      socket.terminate();
    },
  });
  return { socket, stream: { readable, writable } };
}
