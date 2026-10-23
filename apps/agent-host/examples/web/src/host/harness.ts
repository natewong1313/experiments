import type { Workspace } from "@cloudflare/computer";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { PiHarness } from "agents/harness/pi";
import { createModels } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_PROVIDER_ID, createAI } from "agents/models/pi-ai";
import type { AcpModel } from "@experiments/harness-acp";

import { createWorkspaceTools } from "./workspace";
import { sessionTelemetry } from "./session-telemetry";

export const DEFAULT_MODEL: AcpModel = {
  provider: CLOUDFLARE_PROVIDER_ID,
  id: "@cf/moonshotai/kimi-k2.7-code",
};

export function createPiHarness(
  env: Pick<Env, "AI" | "WORKSPACE_DIR">,
  workspace: Workspace,
  objectName: string,
): PiHarness {
  const registry = createRegistry();

  return new PiHarness({
    harness: async ({ storage, context, onWake }): Promise<Harness> => {
      // Setup the workspace.
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
          telemetry: sessionTelemetry(objectName),
          settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 500 } },
          onWake,
        },
        context,
      );
    },
    defaults: {
      model: DEFAULT_MODEL,
      thinkingLevel: "low",
    },
  });
}
