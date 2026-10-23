import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import { Lifecycle } from "agents/lifecycle";

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
import { LifecycleSessionAlarms, websocketStream } from "@experiments/agent-host/helpers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";

import { JAVASCRIPT_BACKEND, workspaceStorage } from "./workspace";
import { createPiHarness, createOpenCodeHarness, MODELS } from "./harness";
import type { MultiAgentEnv } from "./env";

export class AgentHostConnectionRouter extends BaseConnectionRouter<
  MultiAgentEnv,
  AgentHostRoot,
  AgentHostSession
> {
  host = this.env.AGENT_HOST;
  session = this.env.AGENT_SESSION;
}

export class AgentHostRoot extends BaseAgentHostRoot<MultiAgentEnv, AgentHostConnectionRouter> {
  router = this.env.AGENT_ROUTER;
  getAgentInfo(): AgentInfo[] {
    return [agentInfo("pi"), agentInfo("opencode")];
  }
}

export class AgentHostSession extends BaseAgentHostSession<
  MultiAgentEnv,
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
  pi = createPiHarness(this.env, this.workspace);
  opencode = createOpenCodeHarness(this.env, this.workspace);

  sessionAlarms = new LifecycleSessionAlarms(this.ctx);
  lifecycle = Lifecycle.install(this).use(this.sessionAlarms).use(this.pi).use(this.opencode);

  async alarm(): Promise<void> {
    await this.lifecycle.alarm();
  }

  createAlarmScheduler(options: SessionAlarmSchedulerOptions): SessionAlarmScheduler {
    return this.sessionAlarms.scheduler(options);
  }

  getAgentInfo(provider = "pi"): AgentInfo {
    return agentInfo(provider === "opencode" ? "opencode" : "pi");
  }

  getWorkingDirectory(): string {
    return this.env.WORKSPACE_DIR;
  }

  async connectAgent(_sessionId: string, provider: string): Promise<ACPStream> {
    await this.lifecycle.start();

    const { 0: client, 1: server } = new WebSocketPair();

    connectAcp({
      socket: server,
      harness: provider === "opencode" ? this.opencode : this.pi,
      cwd: this.env.WORKSPACE_DIR,
      models: MODELS,
    });

    return websocketStream(client);
  }
}

/**
 * Each AHP model ID matches its ACP `model` config value. Messages select models by this ID.
 */
function agentInfo(harness: string): AgentInfo {
  const name = harness === "opencode" ? "OpenCode" : "Pi";

  return {
    provider: harness,
    displayName: name,
    description: `${name} coding agent`,
    models: MODELS.map((model) => ({
      id: modelValue(model.provider, model.id),
      provider: model.provider,
      name: model.name ?? model.id,
    })),
  };
}
