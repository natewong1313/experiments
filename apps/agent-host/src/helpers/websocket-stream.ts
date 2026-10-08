import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";
import * as z from "zod";
import { AcpMessageSchema, AcpOutboundMessageSchema } from "@experiments/protocol-schemas/acp";
import { MemoryLimitError } from "../memory";
import { FAILED_CONNECTION_CLOSE, MAX_FRAME_BYTES, NORMAL_CLOSE } from "../ahp/protocol";

const MAX_QUEUED_BYTES = 2_097_152;
const frameEncoder = new TextEncoder();

/** Rejects frames exceeding the byte limit or the incoming queue budget, then decodes the frame. */
function decodeFrame(text: string, desiredSize: number | null): AnyMessage {
  if (text.length > MAX_FRAME_BYTES) {
    throw new Error("Invalid ACP WebSocket frame");
  }

  const bytes = frameEncoder.encode(text).byteLength;

  if (bytes > MAX_FRAME_BYTES) {
    throw new Error("Invalid ACP WebSocket frame");
  }

  if (bytes > (desiredSize ?? 0)) {
    throw new MemoryLimitError("ACP incoming queue exceeds the memory budget");
  }

  return AcpMessageSchema.parse(JSON.parse(text));
}

/** Incoming WebSocket frames become ACP messages. */
function createReadable(socket: WebSocket): ReadableStream<AnyMessage> {
  let ended = false;

  return new ReadableStream<AnyMessage>(
    {
      start(controller): void {
        socket.addEventListener("message", (event) => {
          if (ended) {
            return;
          }

          try {
            const text = z.string().parse(event.data);

            controller.enqueue(decodeFrame(text, controller.desiredSize));
          } catch (error) {
            ended = true;
            controller.error(error);
            socket.close(FAILED_CONNECTION_CLOSE, "Invalid ACP frame");
          }
        });
        socket.addEventListener("close", () => {
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
    },
    {
      highWaterMark: MAX_QUEUED_BYTES,
      size(message): number {
        const json = JSON.stringify(message);

        return frameEncoder.encode(json).byteLength;
      },
    },
  );
}

/** Outgoing ACP messages become WebSocket frames. */
function createWritable(socket: WebSocket): WritableStream<AnyMessage> {
  return new WritableStream<AnyMessage>({
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
}

/**
 * Adapts and accepts an unaccepted Workers WebSocket, owning its lifecycle.
 *
 * Sibling in apps/pi-acp/src/websocket-stream.ts has different failure semantics:
 * it soft-fails protocol errors, while this one closes the socket with code 1007.
 */
export function websocketStream(socket: WebSocket): Stream {
  const readable = createReadable(socket);
  const writable = createWritable(socket);

  socket.accept();

  return { readable, writable };
}
