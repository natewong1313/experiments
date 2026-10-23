import { createModels } from "@earendil-works/pi-ai/models";
import type { Models } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { Type } from "@earendil-works/pi-ai";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import type { SessionLifecyclePolicy } from "../../src";
import { AgentSession as BaseSession } from "../../examples/basic/src/durable-objects";
import { GATE_TOOL } from "./gate";

export { default } from "../../examples/basic/src";

export { AgentHost, AgentHostConnectionRouter } from "../../examples/basic/src/durable-objects";

export class AgentSession extends BaseSession {
  private faux = fauxProvider({
    provider: "faux",
    models: [{ id: "test" }],
    tokenSize: { min: 1, max: 1 },
  });
  // Each object starts with a closed gate, also after a restart.
  private gate = Promise.withResolvers<null>();
  private gateCalls = 0;

  setResponses(responses: AssistantMessage[]): void {
    this.faux.setResponses(responses);
  }

  async readFile(path: string): Promise<string> {
    return await this.workspace.fs.readFile(path, "utf8");
  }

  restart(): void {
    this.ctx.abort("Restart for integration test");
  }

  modelCallCount(): number {
    return this.faux.state.callCount;
  }

  /** Returns true once Pi runs the gate tool in this object. */
  gateEntered(): boolean {
    return this.gateCalls > 0;
  }

  releaseGate(): void {
    this.gate.resolve(null);
  }

  // A short heartbeat lets a test see the alarm continue a turn after a restart.
  protected override getLifecyclePolicy(): SessionLifecyclePolicy {
    return { ...super.getLifecyclePolicy(), turnHeartbeatMs: 500 };
  }

  protected override createTools(): ToolRegistration[] {
    const gate: ToolRegistration = {
      name: GATE_TOOL,
      description: "Waits until the test releases it.",
      parameters: Type.Object({}),
      // Pi runs the call again after a restart cuts it off.
      replay: "safe",
      execute: async () => {
        this.gateCalls += 1;
        await this.gate.promise;

        return { output: [{ type: "text", text: "released" }] };
      },
    };

    return [...super.createTools(), gate];
  }

  protected override createModels(): Models {
    const models = createModels();
    models.setProvider(this.faux.provider);

    return models;
  }

  protected override getDefaultModel(): Pick<Model<Api>, "provider" | "id"> {
    return { provider: "faux", id: "test" };
  }
}
