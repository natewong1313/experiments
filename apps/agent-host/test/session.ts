import { AgentSession as BaseSession } from "../src";
import { agent, methods, PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk";
import type { AnyMessage, PromptResponse, Stream } from "@agentclientprotocol/sdk";
import type { SessionSnapshotRequest, SessionSnapshotResponse } from "../src";
import type { TestEnv } from "./worker";
import type { AgentHost } from "./host";

const INTERNAL_ERROR = -32_603;

export class AgentSession extends BaseSession<TestEnv> {
  private cancellations = 0;
  private setup?: ReturnType<typeof Promise.withResolvers<boolean>>;
  private pending?: ReturnType<typeof Promise.withResolvers<PromptResponse>>;
  private snapshotGate?: ReturnType<typeof Promise.withResolvers<null>>;
  private heldSnapshots = 0;

  protected getHostNamespace(): DurableObjectNamespace<AgentHost> {
    return this.env.COORDINATORS;
  }

  protected async connectAgent(): Promise<Stream> {
    const requests: TransformStream<AnyMessage, AnyMessage> = new TransformStream();
    const responses: TransformStream<AnyMessage, AnyMessage> = new TransformStream();
    agent()
      .onRequest(methods.agent.initialize, () => ({
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
      }))
      .onRequest(methods.agent.session.new, async () => {
        if (this.setup && !(await this.setup.promise)) {
          throw new RequestError(INTERNAL_ERROR, "Agent setup failed");
        }

        return { sessionId: crypto.randomUUID() };
      })
      .onRequest(methods.agent.session.load, () => ({}))
      .onNotification(methods.agent.session.cancel, () => {
        this.cancellations += 1;
        this.pending?.resolve({ stopReason: "cancelled" });
      })
      .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
        const [text] = params.prompt;
        const output = text?.type === "text" ? text.text : "";
        // "stream" arrives as several updates; anything else is a single update.
        const chunks = output === "stream" ? ["st", "re", "am"] : [output];

        await Promise.all(
          chunks.map((chunk) =>
            client.notify(methods.client.session.update, {
              sessionId: params.sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: chunk },
              },
            }),
          ),
        );

        if (output === "hold") {
          this.pending = Promise.withResolvers<PromptResponse>();

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

  finishPrompt(): void {
    this.pending?.resolve({ stopReason: "end_turn" });
  }
}
