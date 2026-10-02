import { JsonRpcErrorCodes } from "@microsoft/agent-host-protocol";
import { describe, expect } from "vitest";
import { endpoint, test } from "./client";
import { AhpConnection, initialize } from "./raw";

const uri = process.env.AHP_MCP_URI;

describe("MCP side channel", () => {
  test.skipIf(!uri)(
    "rejects methods outside the advertised MCP capabilities",
    async () => {
      const channel = uri!;
      const connection = await AhpConnection.open(endpoint());

      try {
        await initialize(connection);
        const subscribed = await connection.request("subscribe", { channel });
        expect("result" in subscribed).toBe(true);

        const reply = await connection.request(
          "conformance/methodThatDoesNotExist",
          { channel },
        );

        if (!("error" in reply)) {
          throw new Error("Expected a MethodNotFound error");
        }

        expect(reply.error.code).toBe(JsonRpcErrorCodes.MethodNotFound);
      } finally {
        await connection.close();
      }
    },
  );
});
