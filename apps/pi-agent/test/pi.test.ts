import { env } from "cloudflare:workers";
import {
  client as acpClient,
  methods,
  type ClientConnection,
  type PromptRequest,
  type NewSessionRequest,
  PROTOCOL_VERSION,
  type SessionUpdate,
  type InitializeResponse,
} from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import type { TestHarness } from "./pi-worker";
// Preload the DO before Lifecycle blocks incoming Vite module-loader requests.
// eslint-disable-next-line import/no-unassigned-import
import "./pi-worker";
import { websocketStream } from "../src/websocket-stream";

type TestClient = {
  object: DurableObjectStub<TestHarness>;
  socket: WebSocket;
  connection: ClientConnection;
  updates: SessionUpdate[];
  initialized: InitializeResponse;
};

const CONFLICT = 409;

const SWITCHING_PROTOCOLS = 101;

async function connect(name: string): Promise<TestClient> {
  const object = env.HARNESS.getByName(name);

  const response = await object.fetch("https://agent/acp", {
    headers: { Upgrade: "websocket" },
  });

  const socket = response.webSocket;

  if (!socket) {
    throw new Error(`Upgrade failed: ${response.status}`);
  }

  const updates: SessionUpdate[] = [];

  const connection = acpClient({ name: "pi-test" })
    .onNotification(methods.client.session.update, ({ params }) => {
      updates.push(params.update);
    })
    .onRequest(methods.client.session.requestPermission, () => ({
      outcome: { outcome: "cancelled" },
    }))
    .connect(websocketStream(socket));

  socket.accept();

  const initialized = await connection.agent.request(methods.agent.initialize, {
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
  });

  return { object, socket, connection, updates, initialized };
}

const setup: NewSessionRequest = { cwd: "/workspace", mcpServers: [] };

it("supports the SDK session builder and text collection", async () => {
  const client = await connect(crypto.randomUUID());

  try {
    const text = await client.connection.agent
      .buildSession(setup)
      .withSession(async (session) => {
        void session.prompt("session builder");
        return session.readText();
      });

    expect(text).toBe("echo: session builder");
  } finally {
    client.socket.close();
    await client.connection.closed;
  }
});

describe("durable Pi ACP runtime", () => {
  it("streams model text and accepts a replacement controller", async () => {
    const client = await connect(crypto.randomUUID());

    try {
      expect(client.initialized.agentCapabilities?.loadSession).toBe(true);

      const duplicate = await client.object.fetch("https://agent/acp", {
        headers: { Upgrade: "websocket" },
      });

      expect(duplicate.status).toBe(CONFLICT);
      const session = await client.connection.agent.request(
        methods.agent.session.new,
        setup,
      );
      expect(
        await client.connection.agent.request(methods.agent.session.prompt, {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "hello" }],
        }),
      ).toEqual({ stopReason: "end_turn" });
      expect(
        client.updates
          .flatMap((update) =>
            update.sessionUpdate === "agent_message_chunk" &&
            update.content.type === "text"
              ? [update.content.text]
              : [],
          )
          .join(""),
      ).toBe("echo: hello");
      const updates = [...client.updates];
      await client.connection.agent.request(methods.agent.session.load, {
        ...setup,
        sessionId: session.sessionId,
      });
      expect(client.updates).toEqual(updates);
      await client.connection.agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "after reload" }],
      });
      expect(
        client.updates
          .slice(updates.length)
          .flatMap((update) =>
            update.sessionUpdate === "agent_message_chunk" &&
            update.content.type === "text"
              ? [update.content.text]
              : [],
          )
          .join(""),
      ).toBe("echo: after reload");
      client.socket.close();
      await client.connection.closed;

      const replacement = await client.object.fetch("https://agent/acp", {
        headers: { Upgrade: "websocket" },
      });

      expect(replacement.status).toBe(SWITCHING_PROTOCOLS);
      replacement.webSocket?.accept();
      replacement.webSocket?.close();
    } finally {
      client.socket.close();
    }
  });

  it("retains sessions and workspace files across eviction", async () => {
    const name = crypto.randomUUID();
    const client = await connect(name);
    const session = await client.connection.agent.request(
      methods.agent.session.new,
      setup,
    );

    try {
      await client.connection.agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "save" }],
      });
      expect(
        client.updates.some((update) => update.sessionUpdate === "tool_call"),
      ).toBe(true);
      expect(client.updates).toContainEqual(
        expect.objectContaining({ sessionUpdate: "tool_call", kind: "edit" }),
      );
      expect(
        client.updates.filter(
          (update) => update.sessionUpdate === "tool_call_update",
        ),
      ).toEqual([
        expect.objectContaining({
          status: "completed",
          rawOutput: expect.objectContaining({ role: "toolResult" }),
        }),
      ]);
      expect(await client.object.readSavedFile()).toBe("durable data");
    } finally {
      client.socket.close();
      await client.connection.closed;
    }

    try {
      await client.object.evict();
    } catch {}

    const reconnected = await connect(name);

    try {
      await reconnected.connection.agent.request(methods.agent.session.load, {
        ...setup,
        sessionId: session.sessionId,
      });
      expect(
        reconnected.updates.some(
          (update) =>
            update.sessionUpdate === "agent_message_chunk" &&
            update.content.type === "text" &&
            update.content.text === "File saved.",
        ),
      ).toBe(true);
      const updates = [...reconnected.updates];
      await reconnected.connection.agent.request(methods.agent.session.load, {
        ...setup,
        sessionId: session.sessionId,
      });
      expect(reconnected.updates).toEqual(updates);
      expect(await reconnected.object.readSavedFile()).toBe("durable data");
      expect(
        await reconnected.connection.agent.request(
          methods.agent.session.prompt,
          {
            sessionId: session.sessionId,
            prompt: [{ type: "text", text: "again" }],
          },
        ),
      ).toEqual({ stopReason: "end_turn" });
    } finally {
      reconnected.socket.close();
    }
  });

  it("rejects unsupported session settings and unknown sessions", async () => {
    const client = await connect(crypto.randomUUID());

    try {
      await expect(
        client.connection.agent.request(methods.agent.session.new, {
          ...setup,
          cwd: "/tmp",
        }),
      ).rejects.toThrow(/Invalid params/);
      await expect(
        client.connection.agent.request(methods.agent.session.load, {
          ...setup,
          sessionId: "99999",
        }),
      ).rejects.toThrow(/Invalid params/);
      const session = await client.connection.agent.request(
        methods.agent.session.new,
        setup,
      );
      await expect(
        client.connection.agent.request(methods.agent.session.prompt, {
          sessionId: session.sessionId,
          prompt: [{ type: "image", data: "", mimeType: "image/png" }],
        }),
      ).rejects.toThrow(/Invalid params/);
    } finally {
      client.socket.close();
    }
  });
});

it("executes JavaScript through the Dynamic Worker loader", async () => {
  const client = await connect(crypto.randomUUID());

  try {
    const session = await client.connection.agent.request(
      methods.agent.session.new,
      setup,
    );
    await client.connection.agent.request(methods.agent.session.prompt, {
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "exec" }],
    });

    const output = client.updates
      .flatMap((update) =>
        update.sessionUpdate === "tool_call_update"
          ? (update.content ?? [])
          : [],
      )
      .flatMap((part) =>
        part.type === "content" && part.content.type === "text"
          ? [part.content.text]
          : [],
      )
      .join("");

    expect(output).toContain('"exitCode":0');
    expect(await client.object.readSavedFile()).toBe("executed data");
  } finally {
    client.socket.close();
  }
});

it("cancels a running tool and rejects concurrent prompts", async () => {
  const client = await connect(crypto.randomUUID());

  try {
    const session = await client.connection.agent.request(
      methods.agent.session.new,
      setup,
    );

    const params = {
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "gate" }],
    } satisfies PromptRequest;

    const running = client.connection.agent.request(
      methods.agent.session.prompt,
      params,
    );
    await expect
      .poll(() =>
        client.updates.some((update) => update.sessionUpdate === "tool_call"),
      )
      .toBe(true);
    await expect(
      client.connection.agent.request(methods.agent.session.prompt, params),
    ).rejects.toThrow(/Invalid request/);
    await client.connection.agent.notify(methods.agent.session.cancel, {
      sessionId: session.sessionId,
    });
    expect(await running).toEqual({ stopReason: "cancelled" });
    expect(
      await client.connection.agent.request(methods.agent.session.prompt, {
        ...params,
        prompt: [{ type: "text", text: "after cancel" }],
      }),
    ).toEqual({ stopReason: "end_turn" });
  } finally {
    client.socket.close();
  }
});
