import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type AssistantMessage,
  type Message,
  Type,
} from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import type { PiSessionDefaults } from "agents/harnesses/pi";
import { PiAgent } from "../src/index";

const GATE_WAIT_MS = 60_000;

const MODEL = fauxProvider().getModel();

export class TestHarness extends PiAgent {
  protected override getSessionDefaults(): PiSessionDefaults {
    return { model: { provider: MODEL.provider, modelId: MODEL.id } };
  }

  protected override setupModels(): ReturnType<typeof createModels> {
    this.registry.tools.add({
      name: "gate",
      description: "Wait for cancellation.",
      parameters: Type.Object({}),
      replay: "safe",
      async execute(_args, _api, context) {
        const signal = context.abortSignal;

        if (!signal) {
          throw new Error("Missing abort signal");
        }

        signal.throwIfAborted();
        await scheduler.wait(GATE_WAIT_MS, { signal });

        return { content: [{ type: "text", text: "Gate completed" }] };
      },
    });

    const provider = fauxProvider({ tokensPerSecond: 1000 });
    provider.setResponses(
      Array.from({ length: 100 }, () => (context): AssistantMessage => {
        let last: Message | undefined;

        for (const message of context.messages) {
          if (message.role !== "system") {
            last = message;
          }
        }

        if (last?.role === "toolResult") {
          return fauxAssistantMessage([fauxText("File saved.")]);
        }

        let text = "";

        if (last?.role === "user") {
          text = Array.isArray(last.content)
            ? last.content
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join("")
            : last.content;
        }

        if (text === "gate") {
          return fauxAssistantMessage([fauxToolCall("gate", {})], {
            stopReason: "toolUse",
          });
        }

        if (text === "exec") {
          return fauxAssistantMessage(
            [
              fauxToolCall("exec", {
                command:
                  'import { writeFile } from "node:fs/promises"; export default async function () { await writeFile("/workspace/saved.txt", "executed data"); return "done"; }',
              }),
            ],
            { stopReason: "toolUse" },
          );
        }

        if (text === "save") {
          return fauxAssistantMessage(
            [
              fauxToolCall("write", {
                path: "/workspace/saved.txt",
                content: "durable data",
              }),
            ],
            { stopReason: "toolUse" },
          );
        }

        return fauxAssistantMessage([fauxText(`echo: ${text}`)]);
      }),
    );
    const models = createModels();
    models.setProvider(provider.provider);

    return models;
  }

  async evict(): Promise<void> {
    await this.lifecycle.dispose();
    this.ctx.abort();
  }

  async readSavedFile(): Promise<string> {
    return await this.workspace.fs.readFile("/workspace/saved.txt", "utf8");
  }
}
