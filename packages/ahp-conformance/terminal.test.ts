import type { AhpClient } from "@microsoft/agent-host-protocol/client";
import { describe, expect } from "vitest";
import {
  expectRootState,
  expectState,
  initialized,
  ROOT,
  test,
} from "./client";
import {
  TerminalStateSchema,
  type TerminalState,
} from "@experiments/protocol-schemas";

const terminal = process.env.AHP_TERMINAL_URI;

async function terminalState(client: AhpClient): Promise<TerminalState> {
  await initialized(client);
  const uri = terminal!;
  const subscribed = await client.subscribe(uri);

  return expectState(subscribed.result.snapshot, uri, TerminalStateSchema);
}

describe("terminal channel", () => {
  test.skipIf(!terminal)(
    "subscribes to a fixture terminal",
    async ({ client }) => {
      const state = await terminalState(client);
      expect(state.title.length).toBeGreaterThan(0);
    },
  );

  test.skipIf(!terminal)(
    "has a running or exited lifecycle",
    async ({ client }) => {
      const state = await terminalState(client);
      expect(["running", "exited"]).toContain(state.lifecycle.status);
    },
  );

  test.skipIf(!terminal)(
    "has a client or session claim",
    async ({ client }) => {
      const state = await terminalState(client);
      expect(["client", "session"]).toContain(state.claim.kind);
    },
  );

  test.skipIf(!terminal)("has typed content parts", async ({ client }) => {
    const state = await terminalState(client);

    for (const part of state.content) {
      expect(["unclassified", "command"]).toContain(part.type);
    }
  });

  test.skipIf(!terminal)(
    "has positive dimensions when present",
    async ({ client }) => {
      const state = await terminalState(client);

      for (const dimension of [state.cols, state.rows]) {
        if (!dimension) {
          continue;
        }

        expect(Number.isSafeInteger(dimension)).toBe(true);
        expect(dimension).toBeGreaterThan(0);
      }
    },
  );

  test.skipIf(!terminal)(
    "lists the terminal in root state",
    async ({ client }) => {
      const handshake = await initialized(client, [ROOT]);
      const [snapshot] = handshake.snapshots;

      if (!snapshot) {
        throw new Error("Expected a root snapshot");
      }

      const root = expectRootState(snapshot);
      const terminals = root.terminals ?? [];
      const listed = terminals.some((entry) => entry.resource === terminal);
      expect(listed).toBe(true);
    },
  );

  test.skipIf(!terminal)(
    "matches root terminal title and lifecycle",
    async ({ client }) => {
      const handshake = await initialized(client, [ROOT]);
      const [snapshot] = handshake.snapshots;

      if (!snapshot) {
        throw new Error("Expected a root snapshot");
      }

      const root = expectRootState(snapshot);
      const entry = root.terminals?.find((item) => item.resource === terminal);
      const state = await terminalState(client);
      expect(entry?.title).toBe(state.title);
      expect(entry?.lifecycle).toEqual(state.lifecycle);
    },
  );
});
