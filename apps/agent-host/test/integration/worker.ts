import { createModels } from "@earendil-works/pi-ai/models";
import type { Models } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ModelRef } from "@earendil-works/pi-durable";
import { AgentSession as BaseSession } from "../../examples/basic/src/durable-objects";

export { default } from "../../examples/basic/src";

export { AgentHost, AgentHostConnectionRouter } from "../../examples/basic/src/durable-objects";

export class AgentSession extends BaseSession {
  private faux = fauxProvider({
    provider: "faux",
    models: [{ id: "test" }],
    tokenSize: { min: 1, max: 1 },
  });

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

  protected override createModels(): Models {
    const models = createModels();
    models.setProvider(this.faux.provider);

    return models;
  }

  protected override getDefaultModel(): ModelRef {
    return { provider: "faux", modelId: "test" };
  }
}
