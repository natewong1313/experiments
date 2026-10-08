import { methods, type ClientConnection } from "@agentclientprotocol/sdk";
import {
  ahpMessageToAcpPrompt,
  acpStopReasonToOutcome,
  PromptRequestOutboundSchema,
  PromptResponseSchema,
  CancelNotificationOutboundSchema,
  type AcpTurnOutcome,
} from "@experiments/protocol-schemas/acp";
import type { Message } from "@experiments/protocol-schemas/ahp";
import { ProtocolError, RpcCodes } from "../ahp/protocol";
import { withDeadline } from "../deadline";

const TURN_TIMEOUT_MS = 600_000;

const CANCEL_TIMEOUT_MS = 10_000;

type AgentConversationParams = {
  connection: ClientConnection;
  sessionId: string;
  canReload: boolean;
  activate(): void;
};

export class AgentConversation {
  readonly sessionId: string;
  readonly canReload: boolean;
  private readonly connection: ClientConnection;
  private readonly onActivate: () => void;

  constructor(params: AgentConversationParams) {
    this.connection = params.connection;
    this.sessionId = params.sessionId;
    this.canReload = params.canReload;
    this.onActivate = (): void => {
      params.activate();
    };
  }

  get closed(): boolean {
    return this.connection.signal.aborted;
  }

  activate(): void {
    this.onActivate();
  }

  async prompt(message: Pick<Message, "text" | "attachments">): Promise<AcpTurnOutcome> {
    const mapped = ahpMessageToAcpPrompt(message);

    if (!mapped.ok) {
      throw new ProtocolError(RpcCodes.params, "This host supports text prompts only");
    }

    const request = PromptRequestOutboundSchema.parse({
      sessionId: this.sessionId,
      prompt: mapped.blocks,
    });

    const response = await withDeadline(
      this.connection.agent.request(methods.agent.session.prompt, request),
      TURN_TIMEOUT_MS,
      () => {
        this.abort();
      },
    );

    const result = PromptResponseSchema.parse(response);

    return acpStopReasonToOutcome(result.stopReason);
  }

  async cancel(): Promise<void> {
    const request = CancelNotificationOutboundSchema.parse({
      sessionId: this.sessionId,
    });

    await withDeadline(
      this.connection.agent.notify(methods.agent.session.cancel, request),
      CANCEL_TIMEOUT_MS,
      () => {
        this.abort();
      },
    );
  }

  abort(): void {
    this.connection.close(new Error("Agent operation aborted"));
  }

  release(): void {
    this.connection.close();
  }
}
