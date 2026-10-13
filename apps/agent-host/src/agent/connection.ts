import { client, methods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { ClientConnection, Stream, SessionNotification } from "@agentclientprotocol/sdk";

type ConnectionOptions = {
  stream: Stream;
  cwd: string;
  sessionId: string | null;
  update(notification: SessionNotification): Promise<void>;
};

export async function openAgent(
  options: ConnectionOptions,
): Promise<{ connection: ClientConnection; sessionId: string }> {
  const connection = client({ name: "agent-host" })
    .onNotification(methods.client.session.update, ({ params }) => options.update(params))
    .connect(options.stream);

  try {
    const initialized = await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    if (options.sessionId !== null) {
      if (initialized.agentCapabilities?.loadSession !== true) {
        throw new Error("Agent does not support loading a persisted session");
      }

      await connection.agent.request(methods.agent.session.load, {
        sessionId: options.sessionId,
        cwd: options.cwd,
        mcpServers: [],
      });

      return { connection, sessionId: options.sessionId };
    }

    const created = await connection.agent.request(methods.agent.session.new, {
      cwd: options.cwd,
      mcpServers: [],
    });

    return { connection, sessionId: created.sessionId };
  } catch (error) {
    connection.close();
    throw error;
  }
}
