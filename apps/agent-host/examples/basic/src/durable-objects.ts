import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import { Lifecycle } from "agents/lifecycle";
import { PiHarness } from "agents/harness/pi";
import type { PiModel } from "agents/harness/pi";
import { createModels } from "@earendil-works/pi-ai/models";
import type { Models } from "@earendil-works/pi-ai/models";
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
import { connectAcp } from "@experiments/pi-acp";
import { LifecycleSessionAlarms, websocketStream } from "@experiments/agent-host/helpers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";

import { createWorkspaceTools, JAVASCRIPT_BACKEND, workspaceStorage } from "./workspace";

export class AgentHostConnectionRouter extends BaseConnectionRouter<Env, AgentHost, AgentSession> {
  host = this.env.AGENT_HOST;
  session = this.env.AGENT_SESSION;

  config = {
    unsubscribeAttemptTimeoutMs: 1000,
    unsubscribeAttempts: 11,
  };
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
    harness: async ({ storage, context, onWake }): Promise<Harness> => {
      // Setup the workspace.
      await this.workspace.fs.mkdir(this.env.WORKSPACE_DIR, {
        recursive: true,
      });

      const models = this.createModels();

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
        tools: this.createTools(),
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
      model: this.getDefaultModel(),
      thinkingLevel: "low",
    },
  });
  // The session alarms and Pi share the Durable Object alarm through one Lifecycle.
  sessionAlarms = new LifecycleSessionAlarms(this.ctx);
  lifecycle = Lifecycle.install(this).use(this.sessionAlarms).use(this.harness);

  /**
   * Runs the Lifecycle jobs, which include the session alarms. Lifecycle does not replace an
   * `alarm` that the class defines, so this method forwards to it.
   */
  override async alarm(): Promise<void> {
    await this.lifecycle.alarm();
  }

  protected override createAlarmScheduler(
    options: SessionAlarmSchedulerOptions,
  ): SessionAlarmScheduler {
    return this.sessionAlarms.scheduler(options);
  }

  protected createTools(): ToolRegistration[] {
    return createWorkspaceTools(this.workspace);
  }

  protected createModels(): Models {
    const models = createModels();
    const ai = createAI({ binding: this.env.AI });
    models.setProvider(ai.provider);

    return models;
  }

  protected getDefaultModel(): PiModel {
    return {
      provider: CLOUDFLARE_PROVIDER_ID,
      id: "@cf/moonshotai/kimi-k2.7-code",
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
