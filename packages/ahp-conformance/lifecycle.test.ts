import { AhpErrorCodes } from "@microsoft/agent-host-protocol";
import { describe, expect } from "vitest";
import {
  endpoint,
  expectRootState,
  initialized,
  ROOT,
  VERSION,
  test,
} from "./client";
import { AhpConnection } from "./raw";

describe("connection lifecycle", () => {
  test("answers ping before initialize", async () => {
    const connection = await AhpConnection.open(endpoint());

    try {
      const reply = await connection.request("ping", { channel: ROOT });
      expect("result" in reply).toBe(true);
    } finally {
      await connection.close();
    }
  });

  test.each(["listSessions", "subscribe", "resourceRead"])(
    "rejects %s before initialize",
    async (method) => {
      const connection = await AhpConnection.open(endpoint());

      try {
        const reply = await connection.request(method, {
          channel: ROOT,
          uri: "file:///nonexistent",
        });

        expect("error" in reply).toBe(true);
      } finally {
        await connection.close();
      }
    },
  );

  test("negotiates the package's current protocol version", async ({
    client,
  }) => {
    const result = await initialized(client);
    expect(result.protocolVersion).toBe(VERSION);
  });

  test("accepts a preferred version after an unsupported offer", async () => {
    const connection = await AhpConnection.open(endpoint());

    try {
      const reply = await connection.request("initialize", {
        channel: ROOT,
        clientId: crypto.randomUUID(),
        protocolVersions: ["99.0.0", VERSION],
      });

      if (!("result" in reply)) {
        throw new Error("Expected a successful initialize");
      }

      expect(reply.result).toMatchObject({ protocolVersion: VERSION });
    } finally {
      await connection.close();
    }
  });

  test("returns the unsupported version error", async () => {
    const connection = await AhpConnection.open(endpoint());

    try {
      const reply = await connection.request("initialize", {
        channel: ROOT,
        clientId: crypto.randomUUID(),
        protocolVersions: ["99.0.0"],
      });

      if (!("error" in reply)) {
        throw new Error("Expected an unsupported-version error");
      }

      expect(reply.error.code).toBe(AhpErrorCodes.UnsupportedProtocolVersion);
    } finally {
      await connection.close();
    }
  });

  test("advertises supportedVersions on version rejection", async () => {
    const connection = await AhpConnection.open(endpoint());

    try {
      const reply = await connection.request("initialize", {
        channel: ROOT,
        clientId: crypto.randomUUID(),
        protocolVersions: ["99.0.0"],
      });

      if (!("error" in reply)) {
        throw new Error("Expected version rejection");
      }

      expect(reply.error.data).toMatchObject({
        supportedVersions: expect.any(Array),
      });
    } finally {
      await connection.close();
    }
  });

  test("closes a connection after incompatible version negotiation", async () => {
    const connection = await AhpConnection.open(endpoint());

    try {
      await connection.request("initialize", {
        channel: ROOT,
        clientId: crypto.randomUUID(),
        protocolVersions: ["99.0.0"],
      });
      expect(await connection.waitForClose()).toBe(true);
    } finally {
      await connection.close();
    }
  });

  test("returns a nonnegative server sequence", async ({ client }) => {
    const result = await initialized(client);
    expect(Number.isSafeInteger(result.serverSeq)).toBe(true);
    expect(result.serverSeq).toBeGreaterThanOrEqual(0);
  });

  test("returns no unsolicited snapshots without subscriptions", async ({
    client,
  }) => {
    const result = await initialized(client);
    expect(result.snapshots).toEqual([]);
  });

  test("returns the requested root snapshot during initialize", async ({
    client,
  }) => {
    const result = await initialized(client, [ROOT]);
    expect(result.snapshots).toHaveLength(1);
    expectRootState(result.snapshots[0]);
  });

  test("does not put a snapshot ahead of the reported server sequence", async ({
    client,
  }) => {
    const result = await initialized(client, [ROOT]);
    const [snapshot] = result.snapshots;

    if (!snapshot) {
      throw new Error("Expected a root snapshot");
    }

    expect(snapshot.fromSeq).toBeLessThanOrEqual(result.serverSeq);
  });

  test("answers repeated ping calls after initialize", async ({ client }) => {
    const result = await initialized(client);
    expect(result.protocolVersion).toBe(VERSION);
    await client.ping();
    await client.ping();
  });
});
