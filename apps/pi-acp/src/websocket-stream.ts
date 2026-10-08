import { RequestError, type AnyMessage, type Stream } from "@agentclientprotocol/sdk";
import * as z from "zod";
import { AcpOutboundMessageSchema } from "@experiments/protocol-schemas/acp";

// One incoming frame can not hold more than this many bytes.
const MAX_FRAME_BYTES = 1_048_576;

// 1007 tells the peer that the data in a frame was not valid.
const FAILED_CONNECTION_CLOSE = 1007;

// 1000 is a normal close with no error.
const NORMAL_CLOSE = 1000;
const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);

const JsonRpcMessageSchema = z.union([
  z.object({
    jsonrpc: z.literal("2.0"),
    id: JsonRpcIdSchema,
    method: z.string(),
    params: z.unknown().optional(),
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    method: z.string(),
    params: z.unknown().optional(),
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    id: JsonRpcIdSchema,
    result: z.unknown(),
  }),
  z.object({
    jsonrpc: z.literal("2.0"),
    id: JsonRpcIdSchema,
    error: z.object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    }),
  }),
]);

function sendProtocolError(socket: WebSocket, error: RequestError): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: error.toErrorResponse(),
      }),
    );
  }
}

export function websocketStream(socket: WebSocket): Stream {
  // This flag stops duplicate close and error events after the stream ends.
  let ended = false;

  // The readable side takes frames from the socket and gives messages to the SDK.
  const readable: ReadableStream<AnyMessage> = new ReadableStream({
    start(controller): void {
      socket.addEventListener("message", (event) => {
        if (ended) {
          return;
        }

        const text = z.string().safeParse(event.data);

        if (!text.success || new TextEncoder().encode(text.data).byteLength > MAX_FRAME_BYTES) {
          ended = true;
          socket.close(FAILED_CONNECTION_CLOSE, "Invalid ACP frame");
          controller.error(new Error("Invalid ACP WebSocket frame"));
          return;
        }

        let value: unknown;

        try {
          value = JSON.parse(text.data);
        } catch {
          sendProtocolError(socket, RequestError.parseError());
          return;
        }

        const message = JsonRpcMessageSchema.safeParse(value);

        if (!message.success) {
          sendProtocolError(socket, RequestError.invalidRequest(value));
          return;
        }

        // The SDK validates method-specific params and maps failures to -32602.
        controller.enqueue(message.data);
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

  // The writable side checks each outgoing message and sends it as one text frame.
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

// Make a message stream from a WebSocket.
