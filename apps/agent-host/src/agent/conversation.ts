import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import {
  ahpMessageToAcpPrompt,
  acpStopReasonToOutcome,
  PromptRequestSchema,
  PromptResponseSchema,
  CancelNotificationSchema,
  type AcpTurnOutcome,
} from "@experiments/protocol-schemas/acp";
import type { Message } from "@experiments/protocol-schemas/ahp";
import { ProtocolError, RpcCodes, NORMAL_CLOSE } from "../ahp/protocol";
import { withDeadline } from "../deadline";

const TURN_TIMEOUT_MS = 600_000;

const CANCEL_TIMEOUT_MS = 10_000;

type AgentConversationParams = {
  connection: ClientSideConnection;
  socket: WebSocket;
  sessionId: string;
  canReload: boolean;
};

class AgentConversation {
  readonly sessionId: string;
  readonly canReload: boolean;
  private readonly connection: ClientSideConnection;
  private readonly socket: WebSocket;

  constructor({
    connection,
    socket,
    sessionId,
    canReload,
  }: AgentConversationParams) {
    this.connection = connection;
    this.socket = socket;
    this.sessionId = sessionId;
    this.canReload = canReload;
  }

  get closed(): boolean {
    return this.connection.signal.aborted;
  }

  async prompt(
    message: Pick<Message, "text" | "attachments">,
  ): Promise<AcpTurnOutcome> {
    const mapped = ahpMessageToAcpPrompt(message);

    if (!mapped.ok) {
      throw new ProtocolError(
        RpcCodes.params,
        "This host supports text prompts only",
      );
    }

    const request = PromptRequestSchema.parse({
      sessionId: this.sessionId,
      prompt: mapped.blocks,
    });

    const response = await withDeadline(
      this.connection.prompt(request),
      TURN_TIMEOUT_MS,
      () => {
        this.abort();
      },
    );

    const result = PromptResponseSchema.parse(response);

    return acpStopReasonToOutcome(result.stopReason);
  }

  async cancel(): Promise<void> {
    const request = CancelNotificationSchema.parse({
      sessionId: this.sessionId,
    });

    await withDeadline(
      this.connection.cancel(request),
      CANCEL_TIMEOUT_MS,
      () => {
        this.abort();
      },
    );
  }

  abort(): void {
    this.socket.close();
  }

  release(): void {
    this.socket.close(NORMAL_CLOSE, "Host released agent");
  }
}

export { AgentConversation };
