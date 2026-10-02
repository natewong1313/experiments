import { PROTOCOL_VERSION } from "@microsoft/agent-host-protocol";
import * as z from "zod";
import type { Subscription } from "@microsoft/agent-host-protocol/client";
import { AhpClient } from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";

const ARGUMENT_OFFSET = 2;
const TIMEOUT_MS = 120_000;
const SessionPreviewSchema = z.object({
  lifecycle: z.enum(["creating", "ready", "failed"]),
  defaultChat: z.string(),
  creationError: z.object({ message: z.string() }).optional(),
});
const [endpoint, prompt = "Say hello in one sentence."] =
  process.argv.slice(ARGUMENT_OFFSET);
const transport = await WebSocketTransport.connect(
  endpoint ?? "ws://localhost:8787/hosts/example/ahp",
);
const client = new AhpClient(transport);
const session = `ahp-session:/${crypto.randomUUID()}`;
const timeout = setTimeout(() => {
  void client.shutdown();
}, TIMEOUT_MS);

async function waitUntilReady(
  subscription: Subscription,
  initial: z.output<typeof SessionPreviewSchema>,
): Promise<void> {
  if (initial.lifecycle === "ready") {
    return;
  }
  if (initial.lifecycle === "failed") {
    throw new Error(
      initial.creationError?.message ?? "Session creation failed",
    );
  }
  for await (const event of subscription) {
    if (event.type !== "action") {
      continue;
    }
    const { action } = event.params;
    if (action.type === "session/ready") {
      return;
    }
    if (action.type === "session/creationFailed") {
      throw new Error(action.error.message);
    }
  }
  throw new Error("Connection closed before session became ready");
}

async function runPrompt(chat: string, text: string): Promise<void> {
  const { subscription } = await client.subscribe(chat);
  const turnId = crypto.randomUUID();
  transport.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "dispatchAction",
      params: {
        channel: chat,
        clientSeq: 1,
        action: {
          type: "chat/turnStarted",
          turnId,
          startedAt: new Date().toISOString(),
          message: { text, origin: { kind: "user" } },
        },
      },
    }),
  );
  for await (const event of subscription) {
    if (event.type !== "action") {
      continue;
    }
    if (event.params.rejectionReason !== void 0) {
      throw new Error(event.params.rejectionReason);
    }
    const { action } = event.params;
    if (!("turnId" in action) || action.turnId !== turnId) {
      continue;
    }
    if (action.type === "chat/delta") {
      process.stdout.write(action.content);
    }
    if (action.type === "chat/error") {
      throw new Error(action.part.error.message);
    }
    if (action.type === "chat/turnComplete") {
      process.stdout.write("\n");
      return;
    }
    if (action.type === "chat/turnCancelled") {
      throw new Error("Turn was cancelled");
    }
  }
  throw new Error("Connection closed before turn completed");
}

try {
  client.connect();
  await client.initialize({
    clientId: crypto.randomUUID(),
    protocolVersions: [PROTOCOL_VERSION],
  });
  await client.request("createSession", { channel: session, provider: "pi" });
  const { result, subscription } = await client.subscribe(session);
  const preview = SessionPreviewSchema.parse(result.snapshot?.state);
  await waitUntilReady(subscription, preview);
  const chat = preview.defaultChat;
  process.stderr.write(`${JSON.stringify({ session, chat })}\n`);
  await runPrompt(chat, prompt);
} finally {
  clearTimeout(timeout);
  try {
    if (client.connectionState.status === "connected") {
      await client.request("disposeSession", { channel: session });
    }
  } finally {
    await client.shutdown();
  }
}
