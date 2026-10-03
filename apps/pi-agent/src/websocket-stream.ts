import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";
import * as z from "zod";
import {
  AcpMessageSchema,
  AcpOutboundMessageSchema,
} from "@experiments/protocol-schemas/acp";

const MAX_FRAME_BYTES = 1_048_576;

const FAILED_CONNECTION_CLOSE = 1007;

const NORMAL_CLOSE = 1000;

function websocketStream(socket: WebSocket): Stream {
  let ended = false;

  const readable: ReadableStream<AnyMessage> = new ReadableStream({
    start(controller): void {
      socket.addEventListener("message", (event) => {
        if (ended) {
          return;
        }

        try {
          const text = z.string().parse(event.data);

          if (new TextEncoder().encode(text).byteLength > MAX_FRAME_BYTES) {
            throw new Error("Invalid ACP WebSocket frame");
          }

          const value: unknown = JSON.parse(text);
          controller.enqueue(AcpMessageSchema.parse(value));
        } catch (error) {
          ended = true;
          controller.error(error);
          socket.close(FAILED_CONNECTION_CLOSE, "Invalid ACP frame");
        }
      });
      socket.addEventListener("close", () => {
        socket.close(NORMAL_CLOSE, "ACP connection closed");

        if (!ended) {
          ended = true;
          controller.close();
        }
      });
      socket.addEventListener("error", () => {
        if (!ended) {
          ended = true;
          controller.error(new Error("Agent connection failed"));
        }
      });
    },
    cancel(): void {
      ended = true;
      socket.close(NORMAL_CLOSE, "Host released agent");
    },
  });

  const writable: WritableStream<AnyMessage> = new WritableStream({
    write(message): void {
      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error("Agent connection is closed");
      }

      const parsed = AcpOutboundMessageSchema.parse(message);
      socket.send(JSON.stringify(parsed));
    },
    close(): void {
      socket.close(NORMAL_CLOSE, "Host released agent");
    },
    abort(): void {
      socket.close(FAILED_CONNECTION_CLOSE, "ACP stream aborted");
    },
  });

  return { readable, writable };
}

export { websocketStream };
