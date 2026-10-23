import type { MultiAgentEnv } from "./env";
import type { Workspace } from "@cloudflare/computer";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { createModels } from "@earendil-works/pi-ai/models";
import { OpenCodeWorkerd } from "@opencode/sdk/workerd";
import { OpenCodeHarness } from "agents/harness/opencode";
import { PiHarness } from "agents/harness/pi";
import { createAI as createOpenCodeAI } from "agents/models/opencode";
import { createAI } from "agents/models/pi-ai";
import { createWorkspaceTools, workspacePlugin } from "./workspace";
import type { AcpModel } from "@experiments/harness-acp";

export const MODELS: AcpModel[] = [
  { provider: "cloudflare", id: "@cf/moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code" },
];

export function createPiHarness(env: MultiAgentEnv, workspace: Workspace): PiHarness {
  const registry = createRegistry();

  return new PiHarness({
    harness: async ({ storage, context, onWake }): Promise<Harness> => {
      await workspace.fs.mkdir(env.WORKSPACE_DIR, {
        recursive: true,
      });

      const models = createModels();
      const ai = createAI({ binding: env.AI });
      models.setProvider(ai.provider);

      registry.install({
        name: "workspace",
        sections: [
          {
            key: "preamble",
            render: (): string =>
              `You are a concise coding assistant. Your durable workspace is ${env.WORKSPACE_DIR}. Use read, write, edit, delete, ls, find, grep and exec to work with files. exec runs JavaScript modules, not shell commands. Paths are absolute.`,
            tag: false,
          },
        ],
        tools: createWorkspaceTools(workspace),
      });

      return Harness.open(
        storage,
        {
          models,
          registry,
          settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 500 } },
          onWake,
        },
        context,
      );
    },
    defaults: {
      model: MODELS[0],
      thinkingLevel: "low",
    },
  });
}

export function createOpenCodeHarness(
  env: Pick<MultiAgentEnv, "AI" | "WORKSPACE_DIR">,
  workspace: Workspace,
): OpenCodeHarness {
  const ai = createOpenCodeAI({ binding: env.AI });
  const model = ai("@cf/moonshotai/kimi-k2.7-code", { reasoningEffort: "low" });

  return new OpenCodeHarness({
    opencode: async ({ storage }) => {
      await workspace.fs.mkdir(env.WORKSPACE_DIR, { recursive: true });

      return OpenCodeWorkerd.create({
        storage,
        models: { fetch: false },
        config: { default_agent: "build" },
        plugins: [ai.plugin, workspacePlugin(workspace, env.WORKSPACE_DIR)],
      });
    },
    defaults: { model, agent: "build" },
  });
}
