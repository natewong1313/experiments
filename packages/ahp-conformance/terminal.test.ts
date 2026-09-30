import { describe, expect, it } from "vitest";
import { expectRootState, expectState, initialized, ROOT, withClient } from "./client";
import { TerminalStateSchema, type TerminalState } from "@experiments/protocol-schemas";

const terminal = process.env.AHP_TERMINAL_URI;

async function terminalState(): Promise<TerminalState> {
  return await withClient(async (client) => {
    await initialized(client);
    const uri = terminal!;
    const subscribed = await client.subscribe(uri);
    return expectState(subscribed.result.snapshot, uri, TerminalStateSchema);
  });
}

describe("terminal channel", () => {
  it.skipIf(!terminal)("subscribes to a fixture terminal", async () => {
    const state = await terminalState();
    expect(state.title.length).toBeGreaterThan(0);
  });

  it.skipIf(!terminal)("has a running or exited lifecycle", async () => {
    const state = await terminalState();
    expect(["running", "exited"]).toContain(state.lifecycle.status);
  });

  it.skipIf(!terminal)("has a client or session claim", async () => {
    const state = await terminalState();
    expect(["client", "session"]).toContain(state.claim.kind);
  });

  it.skipIf(!terminal)("has typed content parts", async () => {
    const state = await terminalState();
    for (const part of state.content) {
      expect(["unclassified", "command"]).toContain(part.type);
    }
  });

  it.skipIf(!terminal)("has positive dimensions when present", async () => {
    const state = await terminalState();
    for (const dimension of [state.cols, state.rows]) {
      if (typeof dimension !== "number") {
        continue;
      }
      expect(Number.isSafeInteger(dimension)).toBe(true);
      expect(dimension).toBeGreaterThan(0);
    }
  });

  it.skipIf(!terminal)("lists the terminal in root state", async () => {
    await withClient(async (client) => {
      const handshake = await initialized(client, [ROOT]);
      const [snapshot] = handshake.snapshots;
      if (!snapshot) {

        throw new Error("Expected a root snapshot");

      }
      const root = expectRootState(snapshot);
      const terminals = root.terminals ?? [];
      const listed = terminals.some((entry) => entry.resource === terminal);
      expect(listed).toBe(true);
    });
  });

  it.skipIf(!terminal)("matches root terminal title and lifecycle", async () => {
    await withClient(async (client) => {
      const handshake = await initialized(client, [ROOT]);
      const [snapshot] = handshake.snapshots;
      if (!snapshot) {

        throw new Error("Expected a root snapshot");

      }
      const root = expectRootState(snapshot);
      const entry = root.terminals?.find((item) => item.resource === terminal);
      const state = await terminalState();
      expect(entry?.title).toBe(state.title);
      expect(entry?.lifecycle).toEqual(state.lifecycle);
    });
  });
});
