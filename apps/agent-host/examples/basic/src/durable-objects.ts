import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { Lifecycle } from "agents/lifecycle";
import { PiHarness } from "agents/harnesses/pi";
import { createModels } from "@earendil-works/pi-ai/models";
import type { Models } from "@earendil-works/pi-ai/models";
import type { ModelRef } from "@earendil-works/pi-durable";
import { CLOUDFLARE_PROVIDER_ID, createAI } from "agents/models/pi-ai";

import {
  AgentHostRoot as BaseAgentHostRoot,
  AgentHostSession as BaseAgentHostSession,
  AgentHostConnectionRouter as BaseConnectionRouter,
} from "@experiments/agent-host";
import type { AgentInfo } from "@experiments/agent-host";
import { connectAcp } from "@experiments/pi-acp";
import { websocketStream } from "@experiments/agent-host/helpers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";

import { createWorkspaceTools, JAVASCRIPT_BACKEND, workspaceStorage } from "./workspace";

export class AgentHostConnectionRouter extends BaseConnectionRouter<Env, AgentHost, AgentSession> {
  host = this.env.AGENT_HOST;
  session = this.env.AGENT_SESSION;
}

const PI_AGENT: AgentInfo = {
  provider: "pi",
  displayName: "Pi",
  description: "Pi coding agent",
  models: [],
};

export class AgentHost extends BaseAgentHostRoot<Env, AgentHostConnectionRouter> {
  router = this.env.AGENT_ROUTER;
  getAgentInfo(): AgentInfo {
    return PI_AGENT;
  }
}

export class AgentSession extends BaseAgentHostSession<Env, AgentHostConnectionRouter, AgentHost> {
  router = this.env.AGENT_ROUTER;
  host = this.env.AGENT_HOST;

  getAgentInfo(): AgentInfo {
    return PI_AGENT;
  }

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

      const models = this.createModels();

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
      model: this.getDefaultModel(),
      thinkingLevel: "low",
      retry: { enabled: true, maxRetries: 2, baseDelayMs: 500 },
    },
  });
  lifecycle = Lifecycle.install(this).use(this.harness);

  protected createModels(): Models {
    const models = createModels();
    const ai = createAI({ binding: this.env.AI });
    models.setProvider(ai.provider);

    return models;
  }

  protected getDefaultModel(): ModelRef {
    return {
      provider: CLOUDFLARE_PROVIDER_ID,
      modelId: "@cf/moonshotai/kimi-k2.7-code",
    };
  }

  protected getWorkingDirectory(): string {
    return this.env.WORKSPACE_DIR;
  }

  protected override async connectAgent(_sessionId: string): Promise<ACPStream> {
    await this.lifecycle.start();

    const { 0: client, 1: server } = new WebSocketPair();

    connectAcp({
      socket: server,
      harness: this.harness,
      cwd: this.env.WORKSPACE_DIR,
    });

    return websocketStream(client);
  }
}
