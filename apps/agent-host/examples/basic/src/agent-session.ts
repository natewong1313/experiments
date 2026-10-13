import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import { createWorkspaceTools, JAVASCRIPT_BACKEND, workspaceStorage } from "./workspace";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { Lifecycle } from "agents/lifecycle";
import { PiHarness, type PiHarnessOptions } from "agents/harnesses/pi";
import { createModels, type MutableModels } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_PROVIDER_ID, createAI } from "agents/models/pi-ai";
import { connectAcp } from "@experiments/pi-acp";

import { AgentSession as BaseAgentSession } from "@experiments/agent-host";
import { websocketStream } from "@experiments/agent-host/helpers";
import type { AgentConfig, AcpConnectionOptions } from "@experiments/agent-host";
import type { Stream as AcpStream } from "@agentclientprotocol/sdk";

export class AgentSession extends BaseAgentSession<Env> {
  workspace = new Workspace({
    storage: workspaceStorage(this.ctx.storage),
    git: createGitClient(),
    backends: [
      new WorkerJavaScriptBackend({
        id: JAVASCRIPT_BACKEND,
        loader: this.env.LOADER,
        root: this.env.WORKSPACE_DIR,
        access: "read-write",
        allowGitNetwork: true,
      }),
    ],
  });
  registry = createRegistry();
  harness = new PiHarness({
    harness: async ({ storage, context }): Promise<Harness> => {
      // Setup the workspace.
      await this.workspace.fs.mkdir(this.env.WORKSPACE_DIR, {
        recursive: true,
      });

      const models = createModels();
      const ai = createAI({ binding: this.env.AI });
      models.setProvider(ai.provider);

      this.registry.batch(() => {
        this.registry.systemPrompt.section(
          "preamble",
          () =>
            `You are a concise coding assistant. Your durable workspace is ${this.env.WORKSPACE_DIR}. Use read, write, edit, delete, ls, find, grep and exec to work with files. exec runs JavaScript modules, not shell commands. Paths are absolute.`,
          { tag: false },
        );

        for (const tool of createWorkspaceTools(this.workspace)) {
          this.registry.tools.add(tool);
        }
      });

      return Harness.open(storage, { models, registry: this.registry }, context);
    },
    defaults: {
      model: {
        provider: CLOUDFLARE_PROVIDER_ID,
        modelId: "@cf/moonshotai/kimi-k2.7-code",
      },
      thinkingLevel: "low",
      retry: { enabled: true, maxRetries: 2, baseDelayMs: 500 },
    },
  });
  lifecycle = Lifecycle.install(this).use(this.harness);

  protected override async connectAgent(_sessionId: string): Promise<AcpStream> {
    await this.lifecycle.start();

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    connectAcp({
      socket: server,
      harness: this.harness,
      cwd: this.env.WORKSPACE_DIR,
    });

    return websocketStream(client);
  }
}
