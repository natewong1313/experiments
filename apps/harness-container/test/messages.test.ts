import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MESSAGE_BYTES,
  decodeFrame,
  normalizeMessage,
  parseMessage,
} from "../container/messages.ts";

void describe("ACP message framing", () => {
  void it("preserves bidirectional request IDs, extension fields, and embedded line breaks", () => {
    const request = {
      jsonrpc: "2.0",
      id: "permission-1",
      method: "session/request_permission",
      params: { sessionId: "session-1", text: "first\nsecond\u2028third" },
      _meta: { trace: "trace-1" },
    };
    const frame = normalizeMessage(JSON.stringify(request, null, 2));
    assert.equal(frame.includes("\n"), false);
    assert.deepEqual(JSON.parse(frame), request);
  });

  void it("accepts cancellation notifications and success and error responses", () => {
    const messages = [
      { jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "s" } },
      { jsonrpc: "2.0", id: 0, result: null },
      {
        jsonrpc: "2.0",
        id: "permission-1",
        result: { outcome: { outcome: "cancelled" } },
      },
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32_700,
          message: "Parse error",
          data: { reason: "Invalid JSON" },
          _meta: { trace: "error-trace" },
        },
      },
    ];
    for (const message of messages) {
      assert.deepEqual(parseMessage(JSON.stringify(message)), message);
    }
  });

  void it("rejects malformed envelopes and batches", () => {
    const invalid = [
      "not json",
      "[]",
      "null",
      '{"jsonrpc":"1.0","method":"initialize"}',
      '{"jsonrpc":"2.0","id":1}',
      '{"jsonrpc":"2.0","id":1,"error":{"message":"missing code"}}',
    ];
    for (const text of invalid) {
      assert.throws(() => parseMessage(text));
    }
  });

  void it("enforces the message limit in UTF-8 bytes", () => {
    const oversized = JSON.stringify({
      jsonrpc: "2.0",
      method: "test",
      params: "🌍".repeat(MAX_MESSAGE_BYTES / 2),
    });
    assert.throws(() => parseMessage(oversized), /size limit/);
  });

  void it("decodes UTF-8 and rejects malformed UTF-8", () => {
    const encoded = new TextEncoder().encode("hello 🌍");
    assert.equal(decodeFrame(encoded.buffer), "hello 🌍");
    assert.throws(() => decodeFrame(new Uint8Array([255]).buffer));
  });
});
