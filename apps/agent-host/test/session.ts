import { AgentSession as BaseSession } from "../src";
import {
  agent as acpAgent,
  methods as acpMethods,
  PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
  RequestError as ACPRequestError,
} from "@agentclientprotocol/sdk";
import type {
  AnyMessage as ACPAnyMessage,
  PromptResponse as ACPPromptResponse,
  Stream as ACPStream,
} from "@agentclientprotocol/sdk";
import type { SessionSnapshotRequest, SessionSnapshotResponse } from "../src";
import type { TestEnv } from "./worker";
import type { AgentHost } from "./host";

const INTERNAL_ERROR = -32_603;

export class AgentSession extends BaseSession<TestEnv> {
  private cancellations = 0;
  private setup?: ReturnType<typeof Promise.withResolvers<boolean>>;
  private pending?: ReturnType<typeof Promise.withResolvers<ACPPromptResponse>>;
  private snapshotGate?: ReturnType<typeof Promise.withResolvers<null>>;
  private heldSnapshots = 0;

  protected getHostNamespace(): DurableObjectNamespace<AgentHost> {
    return this.env.COORDINATORS;
  }

  protected async connectAgent(): Promise<ACPStream> {
    const requests: TransformStream<ACPAnyMessage, ACPAnyMessage> = new TransformStream();
    const responses: TransformStream<ACPAnyMessage, ACPAnyMessage> = new TransformStream();
    acpAgent()
      .onRequest(acpMethods.agent.initialize, () => ({
        protocolVersion: ACP_PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
      }))
      .onRequest(acpMethods.agent.session.new, async () => {
        if (this.setup && !(await this.setup.promise)) {
          throw new ACPRequestError(INTERNAL_ERROR, "Agent setup failed");
        }

        return { sessionId: crypto.randomUUID() };
      })
      .onRequest(acpMethods.agent.session.load, () => ({}))
      .onNotification(acpMethods.agent.session.cancel, () => {
        this.cancellations += 1;
        this.pending?.resolve({ stopReason: "cancelled" });
      })
      .onRequest(acpMethods.agent.session.prompt, async ({ params, client }) => {
        const [text] = params.prompt;
        const output = text?.type === "text" ? text.text : "";
        // "stream" arrives as several updates; anything else is a single update.
        const chunks = output === "stream" ? ["st", "re", "am"] : [output];

        await Promise.all(
          chunks.map((chunk) =>
            client.notify(acpMethods.client.session.update, {
              sessionId: params.sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: chunk },
              },
            }),
          ),
        );

        if (output === "hold") {
          this.pending = Promise.withResolvers<ACPPromptResponse>();

          return await this.pending.promise;
        }

        return { stopReason: "end_turn" };
      })
      .connect({ readable: requests.readable, writable: responses.writable });

    return { readable: responses.readable, writable: requests.writable };
  }

  async snapshot(req: SessionSnapshotRequest): Promise<SessionSnapshotResponse> {
    if (this.snapshotGate) {
      this.heldSnapshots += 1;
      await this.snapshotGate.promise;
    }

    return await super.snapshot(req);
  }

  holdSnapshots(): void {
    this.snapshotGate = Promise.withResolvers<null>();
  }

  heldSnapshotCount(): number {
    return this.heldSnapshots;
  }

  releaseSnapshots(): void {
    this.snapshotGate?.resolve(null);
    this.snapshotGate = undefined;
  }

  holdInitialization(): void {
    this.setup = Promise.withResolvers<boolean>();
  }

  releaseInitialization(success: boolean): void {
    this.setup?.resolve(success);
  }

  cancellationCount(): number {
    return this.cancellations;
  }

  failDeliveryScheduling(): void {
    const setAlarm = this.db.setAlarm.bind(this.db);
    let saved = false;

    this.db.setAlarm = async (time): Promise<void> => {
      if (saved) {
        this.db.setAlarm = setAlarm;
        throw new Error("Delivery scheduling failed");
      }

      saved = true;
      await setAlarm(time);
    };
  }

  finishPrompt(): void {
    this.pending?.resolve({ stopReason: "end_turn" });
  }
}
