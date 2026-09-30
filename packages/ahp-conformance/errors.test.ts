import { AhpErrorCodes, JsonRpcErrorCodes } from "@microsoft/agent-host-protocol";
import { ListSessionsResultSchema } from "@experiments/protocol-schemas";
import { describe, expect, it } from "vitest";
import { chatSnapshot, endpoint, expectRpcError, initialized, ROOT, SESSION, withClient } from "./client";
import { AhpConnection, initialize } from "./raw";

describe("JSON-RPC and AHP errors", () => {
  it("rejects an unknown method with MethodNotFound", async () => {
    const connection = await AhpConnection.open(endpoint());
    try {
      await initialize(connection);
      const reply = await connection.request("conformance/methodThatDoesNotExist", { channel: ROOT });
      if (!("error" in reply)) {
        throw new Error("Expected a MethodNotFound error");
      }
      expect(reply.error.code).toBe(JsonRpcErrorCodes.MethodNotFound);
    } finally {
      await connection.close();
    }
  });

  it("keeps the connection alive after MethodNotFound", async () => {
    const connection = await AhpConnection.open(endpoint());
    try {
      await initialize(connection);
      await connection.request("conformance/methodThatDoesNotExist", { channel: ROOT });
      const reply = await connection.request("ping", { channel: ROOT });
      expect("result" in reply).toBe(true);
    } finally {
      await connection.close();
    }
  });

  it("correlates concurrent JSON-RPC responses by request id", async () => {
    const connection = await AhpConnection.open(endpoint());
    try {
      await initialize(connection);
      const replies = await Promise.all([
        connection.request("ping", { channel: ROOT }),
        connection.request("listSessions", { channel: ROOT, limit: 1 }),
      ]);
      const [first, second] = replies;
      if (!first || !second) {

        throw new Error("Expected two replies");

      }
      expect(first.id).not.toBe(second.id);
      expect("result" in first).toBe(true);
      expect("result" in second).toBe(true);
    } finally {
      await connection.close();
    }
  });

  it("returns a JSON-RPC error object with numeric code and message", async () => {
    const connection = await AhpConnection.open(endpoint());
    try {
      await initialize(connection);
      const reply = await connection.request("conformance/methodThatDoesNotExist", { channel: ROOT });
      if (!("error" in reply)) {
        throw new Error("Expected an error");
      }
      expect(Number.isSafeInteger(reply.error.code)).toBe(true);
      expect(reply.error.message.length).toBeGreaterThan(0);
    } finally {
      await connection.close();
    }
  });

  it("rejects a nonexistent provider without creating a session", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const uri = `ahp-session:/${crypto.randomUUID()}`;
      const error = await expectRpcError(() => client.request("createSession", {
        channel: uri, provider: `conformance-missing-${crypto.randomUUID()}`,
      }), AhpErrorCodes.ProviderNotFound);
      expect(error.code).toBe(AhpErrorCodes.ProviderNotFound);
      const page = ListSessionsResultSchema.parse(await client.request("listSessions", { channel: ROOT }));
      const created = page.items.some((item) => item.resource === uri);
      expect(created).toBe(false);
    });
  });

  it("returns an error for a nonexistent session subscription", async () => {
    await withClient(async (client) => {
      await initialized(client);
      await expect(client.subscribe(`ahp-session:/${crypto.randomUUID()}`)).rejects.toThrowError(/.+/);
    });
  });

  it.skipIf(!SESSION)("rejects creation of an existing fixture session", async () => {
    const uri = SESSION!;
    await withClient(async (client) => {
      await initialized(client);
      const page = ListSessionsResultSchema.parse(await client.request("listSessions", { channel: ROOT }));
      const existing = page.items.find((item) => item.resource === uri);
      if (!existing) {

        throw new Error("Fixture session absent from catalogue");

      }
      const error = await expectRpcError(() => client.request("createSession", {
        channel: uri, provider: existing.provider,
      }), AhpErrorCodes.SessionAlreadyExists);
      expect(error.code).toBe(AhpErrorCodes.SessionAlreadyExists);
    });
  });

  it.skipIf(!SESSION)("rejects an unrecognized turn-history cursor", async () => {
    await withClient(async (client) => {
      await initialized(client);
      const chat = await chatSnapshot(client);
      const error = await expectRpcError(() => client.request("fetchTurns", {
        channel: chat.uri, cursor: `conformance-invalid-${crypto.randomUUID()}`,
      }), JsonRpcErrorCodes.InvalidParams);
      expect(error.code).toBe(JsonRpcErrorCodes.InvalidParams);
    });
  });
});
