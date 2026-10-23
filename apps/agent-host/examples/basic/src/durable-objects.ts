import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { Lifecycle } from "agents/lifecycle";
import { PiHarness } from "agents/harness/pi";
import { createModels } from "@earendil-works/pi-ai/models";
import { CLOUDFLARE_PROVIDER_ID, createAI } from "agents/models/pi-ai";

import {
  AgentHostRoot as BaseAgentHostRoot,
  AgentHostSession as BaseAgentHostSession,
  AgentHostConnectionRouter as BaseConnectionRouter,
} from "@experiments/agent-host";
import type {
  AgentInfo,
  SessionAlarmScheduler,
  SessionAlarmSchedulerOptions,
} from "@experiments/agent-host";
import { connectAcp, modelValue } from "@experiments/pi-acp";
import type { AcpModel } from "@experiments/pi-acp";
import { LifecycleSessionAlarms, websocketStream } from "@experiments/agent-host/helpers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";

import { createWorkspaceTools, JAVASCRIPT_BACKEND, workspaceStorage } from "./workspace";

const MODELS: AcpModel[] = [
  { provider: CLOUDFLARE_PROVIDER_ID, id: "@cf/moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code" },
];

export class AgentHostConnectionRouter extends BaseConnectionRouter<
  Env,
  AgentHostRoot,
  AgentHostSession
> {
  host = this.env.AGENT_HOST;
  session = this.env.AGENT_SESSION;
}

export class AgentHostRoot extends BaseAgentHostRoot<Env, AgentHostConnectionRouter> {
  router = this.env.AGENT_ROUTER;
  getAgentInfo(): AgentInfo {
    return piAgent();
  }
}

export class AgentHostSession extends BaseAgentHostSession<
  Env,
  AgentHostConnectionRouter,
  AgentHostRoot
> {
  router = this.env.AGENT_ROUTER;
  host = this.env.AGENT_HOST;

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
    harness: async ({ storage, context, onWake }): Promise<Harness> => {
      // Setup the workspace.
      await this.workspace.fs.mkdir(this.env.WORKSPACE_DIR, {
        recursive: true,
      });

      const models = createModels();
      const ai = createAI({ binding: this.env.AI });
      models.setProvider(ai.provider);

      this.registry.install({
        name: "workspace",
        sections: [
          {
            key: "preamble",
            render: (): string =>
              `You are a concise coding assistant. Your durable workspace is ${this.env.WORKSPACE_DIR}. Use read, write, edit, delete, ls, find, grep and exec to work with files. exec runs JavaScript modules, not shell commands. Paths are absolute.`,
            tag: false,
          },
        ],
        tools: createWorkspaceTools(this.workspace),
      });

      return Harness.open(
        storage,
        {
          models,
          registry: this.registry,
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
  sessionAlarms = new LifecycleSessionAlarms(this.ctx);
  lifecycle = Lifecycle.install(this).use(this.sessionAlarms).use(this.harness);

  async alarm(): Promise<void> {
    await this.lifecycle.alarm();
  }

  createAlarmScheduler(options: SessionAlarmSchedulerOptions): SessionAlarmScheduler {
    return this.sessionAlarms.scheduler(options);
  }

  getAgentInfo(): AgentInfo {
    return piAgent();
  }

  getWorkingDirectory(): string {
    return this.env.WORKSPACE_DIR;
  }

  async connectAgent(_sessionId: string): Promise<ACPStream> {
    await this.lifecycle.start();

    const { 0: client, 1: server } = new WebSocketPair();

    connectAcp({
      socket: server,
      harness: this.harness,
      cwd: this.env.WORKSPACE_DIR,
      models: MODELS,
    });

    return websocketStream(client);
  }
}

/**
 * Returns agent info for `models`. Each AHP model ID matches its ACP `model` config value.
 * Messages select models by this ID.
 */
function piAgent(): AgentInfo {
  return {
    provider: "pi",
    displayName: "Pi",
    description: "Pi coding agent",
    models: MODELS.map((model) => ({
      id: modelValue(model.provider, model.id),
      provider: model.provider,
      name: model.name ?? model.id,
    })),
  };
}
