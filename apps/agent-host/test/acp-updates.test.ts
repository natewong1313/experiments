import { methods } from "@agentclientprotocol/sdk";
import { expect, it, vi } from "vitest";
import { AcpStateSchema, SessionNotificationSchema } from "@experiments/protocol-schemas/acp";
import {
  ChatStateSchema,
  SessionStateSchema,
  SubscribeResultSchema,
} from "@experiments/protocol-schemas/ahp";
import { ACP_UPDATES } from "../../../packages/protocol-schemas/test/acp-updates";
import { withAcpAgent } from "./acp-host";

const SESSION = "ahp-session:/host-test";

it("retains every ACP update, child traffic and setup metadata in snapshots", async () => {
  await withAcpAgent({
    setup: async (host, sessionId) => {
      await host.notify(methods.client.session.update, {
        sessionId,
        update: ACP_UPDATES.available_commands_update,
      });
    },
    prompt: async (connection, request) => {
      await Promise.all(
        Object.values(ACP_UPDATES).map((update) =>
          connection.client.notify(methods.client.session.update, {
            sessionId: request.sessionId,
            update,
          }),
        ),
      );
      await connection.client.notify(methods.client.session.update, {
        sessionId: "child",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Child answer" },
        },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId: "unrelated",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Wrong session" },
        },
      });

      return { stopReason: "end_turn" };
    },
    run: async (peer, chat, _disconnect, notify) => {
      const setup = SubscribeResultSchema.parse(
        await peer.request("subscribe", { channel: SESSION }),
      );

      const setupState = SessionStateSchema.parse(setup.snapshot?.state);
      expect(AcpStateSchema.parse(setupState._meta?.acp).conversation?.commands).toMatchObject({
        availableCommands: [{ name: "help" }],
      });
      peer.notify("dispatchAction", {
        channel: chat,
        clientSeq: 1,
        action: {
          type: "chat/turnStarted",
          turnId: "coverage",
          startedAt: new Date().toISOString(),
          message: { text: "Hello", origin: { kind: "user" } },
        },
      });
      await vi.waitFor(() => {
        expect(peer.actions.some(({ action }) => action.type === "chat/turnComplete")).toBe(true);
      });

      const session = SubscribeResultSchema.parse(
        await peer.request("subscribe", { channel: SESSION }),
      );

      const sessionState = SessionStateSchema.parse(session.snapshot?.state);
      const acp = AcpStateSchema.parse(sessionState._meta?.acp).conversation;
      expect(sessionState.title).toBe("Agent title");
      expect(acp).toMatchObject({
        commands: { availableCommands: [{ name: "help" }] },
        mode: { currentModeId: "code" },
        config: { configOptions: [{ currentValue: true }] },
        plan: { entries: [{ content: "Read" }] },
        plans: {},
        usage: { used: 20, size: 100, cost: { currency: "USD" } },
        notice: { title: "Rate limit" },
        compactions: { compaction: { summary: [{ text: "Summary" }] } },
        subagents: { child: { title: "Research", state: { state: "running" } } },
        messages: { message: { content: [{ text: "Find details" }, { text: "More details" }] } },
      });

      const snapshot = SubscribeResultSchema.parse(
        await peer.request("subscribe", { channel: chat }),
      );

      const state = ChatStateSchema.parse(snapshot.snapshot?.state);
      const [turn] = state.turns;
      expect(turn?.state).toBe("complete");
      const transcript = JSON.stringify(turn?.responseParts);
      expect(transcript).toContain("Child answer");
      expect(transcript).not.toContain("Wrong session");
      expect(turn?.responseParts.find((part) => part.kind === "toolCall")).toMatchObject({
        toolCall: {
          content: [{ type: "resource" }, { type: "fileEdit" }, { type: "terminal" }],
          structuredContent: { acp: { rawOutput: { result: true } } },
        },
      });

      const retained = turn?.responseParts.flatMap((part) =>
        part.kind === "systemNotification"
          ? [SessionNotificationSchema.parse(part._meta?.acp)]
          : [],
      );

      expect(retained?.map(({ update }) => update.sessionUpdate)).toEqual(
        expect.arrayContaining([
          "user_message_chunk",
          "plan",
          "plan_update",
          "plan_removed",
          "notice",
          "compaction_update",
          "compaction_summary_chunk",
          "subagent_update",
          "session_message",
          "session_message_chunk",
        ]),
      );
      await notify({
        sessionId: "conversation",
        update: { sessionUpdate: "current_mode_update", currentModeId: "review" },
      });
      await vi.waitFor(async () => {
        const result = SubscribeResultSchema.parse(
          await peer.request("subscribe", { channel: SESSION }),
        );

        const after = SessionStateSchema.parse(result.snapshot?.state);
        expect(AcpStateSchema.parse(after._meta?.acp).conversation?.mode?.currentModeId).toBe(
          "review",
        );
      });
    },
  });
});

const OVERSIZED_METADATA = 70_000;

it("rolls back oversized ACP metadata and ends the turn with a resource limit", async () => {
  await withAcpAgent({
    prompt: async (connection, { sessionId }) => {
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: { sessionUpdate: "current_mode_update", currentModeId: "code" },
      });
      await connection.client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "session_info_update",
          title: "x".repeat(OVERSIZED_METADATA),
        },
      });

      return { stopReason: "end_turn" };
    },
    run: async (peer, chat) => {
      peer.notify("dispatchAction", {
        channel: chat,
        clientSeq: 1,
        action: {
          type: "chat/turnStarted",
          turnId: "bounded-metadata",
          startedAt: new Date().toISOString(),
          message: { text: "Hello", origin: { kind: "user" } },
        },
      });
      await vi.waitFor(() => {
        expect(
          peer.actions.some(
            ({ action }) =>
              action.type === "chat/error" && action.part.error.errorType === "resource-limit",
          ),
        ).toBe(true);
      });

      const result = SubscribeResultSchema.parse(
        await peer.request("subscribe", { channel: SESSION }),
      );

      const session = SessionStateSchema.parse(result.snapshot?.state);
      const acp = AcpStateSchema.parse(session._meta?.acp).conversation;

      expect(acp?.mode?.currentModeId).toBe("code");
      expect(acp?.info).toBeUndefined();
      expect(session.title).not.toBe("x".repeat(OVERSIZED_METADATA));
    },
  });
});
