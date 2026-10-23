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
import { connectAcp, modelValue } from "@experiments/harness-acp";
import type { AcpModel } from "@experiments/harness-acp";
import { LifecycleSessionAlarms, websocketStream } from "@experiments/agent-host/helpers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";

import { createWorkspaceTools, JAVASCRIPT_BACKEND, workspaceStorage } from "./workspace";
import { evictObject } from "./debug-eviction";
import { sessionTelemetry } from "./session-telemetry";

/** The model that a new session runs until a client selects another one. */
const DEFAULT_MODEL: AcpModel = {
  provider: CLOUDFLARE_PROVIDER_ID,
  id: "@cf/moonshotai/kimi-k2.7-code",
};

export class AgentHostConnectionRouter extends BaseConnectionRouter<
  Env,
  AgentHostRoot,
  AgentHostSession
> {
  host = this.env.AGENT_HOST;
  session = this.env.AGENT_SESSION;

  evict(): void {
    evictObject(this.ctx);
  }
}

export class AgentHostRoot extends BaseAgentHostRoot<Env, AgentHostConnectionRouter> {
  router = this.env.AGENT_ROUTER;

  evict(): void {
    evictObject(this.ctx);
  }

  getAgentInfo(): AgentInfo {
    return piAgentInfo(this.env.AI);
  }
}

export class AgentHostSession extends BaseAgentHostSession<
  Env,
  AgentHostConnectionRouter,
  AgentHostRoot
> {
  router = this.env.AGENT_ROUTER;
  host = this.env.AGENT_HOST;

  inspectObjects(): ReturnType<BaseAgentHostSession["inspectObjects"]> {
    return super.inspectObjects();
  }

  evict(): void {
    evictObject(this.ctx);
  }

  getAgentInfo(): AgentInfo {
    return piAgentInfo(this.env.AI);
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

      const objectName = this.ctx.id.name ?? this.ctx.id.toString();

      return Harness.open(
        storage,
        {
          models,
          registry: this.registry,
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
  sessionAlarms = new LifecycleSessionAlarms(this.ctx);
  lifecycle = Lifecycle.install(this).use(this.sessionAlarms).use(this.harness);

  async alarm(): Promise<void> {
    await this.lifecycle.alarm();
  }

  createAlarmScheduler(options: SessionAlarmSchedulerOptions): SessionAlarmScheduler {
    return this.sessionAlarms.scheduler(options);
  }

  getWorkingDirectory(): string {
    return this.env.WORKSPACE_DIR;
  }

  async connectAgent(_sessionId: string): Promise<ACPStream> {
    const { 0: client, 1: server } = new WebSocketPair();

    await this.lifecycle.start();

    connectAcp({
      socket: server,
      harness: this.harness,
      cwd: this.env.WORKSPACE_DIR,
      onDiagnostic: (diagnostic): void => {
        console.info("ACP timing", { objectName: this.ctx.id.name, ...diagnostic });
      },
      models: piModels(this.env.AI).map((entry) => entry.acp),
    });

    return websocketStream(client);
  }
}

/** One model of the Workers AI binding: as ACP selects it, and as AHP lists it. */
type PiCatalogEntry = {
  readonly acp: AcpModel;
  readonly info: AgentInfo["models"][number];
};

/**
 * Returns the models that the Workers AI binding offers, with the default model first, so a
 * client that lists the models without choosing one shows the model of a new session.
 *
 * AHP identifies a model by its ACP config value, which is its provider and model ID joined
 * with a slash, because a session selects the model through that value.
 */
function piModels(ai: Ai): PiCatalogEntry[] {
  const models = createModels();
  models.setProvider(createAI({ binding: ai }).provider);

  const entries = models.getModels(CLOUDFLARE_PROVIDER_ID).map((model): PiCatalogEntry => ({
    acp: { provider: model.provider, id: model.id, name: model.name },
    info: {
      id: modelValue(model.provider, model.id),
      provider: model.provider,
      name: model.name,
      maxContextWindow: model.contextWindow,
      maxOutputTokens: model.maxTokens,
      supportsVision: model.input.includes("image"),
    },
  }));

  const defaultId = modelValue(DEFAULT_MODEL.provider, DEFAULT_MODEL.id);

  return [
    ...entries.filter((entry) => entry.info.id === defaultId),
    ...entries.filter((entry) => entry.info.id !== defaultId),
  ];
}

/** Returns the agent info that AHP lists, with the default model first. */
function piAgentInfo(ai: Ai): AgentInfo {
  return {
    provider: "pi",
    displayName: "Pi",
    description: "Pi coding agent",
    models: piModels(ai).map((entry) => entry.info),
  };
}
