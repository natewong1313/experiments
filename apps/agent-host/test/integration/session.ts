import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { Type } from "@earendil-works/pi-ai";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import { connectAcp } from "@experiments/harness-acp";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";
import { Lifecycle } from "agents/lifecycle";
import { PiHarness } from "agents/harness/pi";
import { AgentHostSession as BaseAgentHostSession } from "../../src";
import type {
  AgentInfo,
  SessionAlarmScheduler,
  SessionAlarmSchedulerOptions,
  SessionLifecyclePolicy,
} from "../../src";
import { LifecycleSessionAlarms, websocketStream } from "../../src/helpers";
import { AGENT_INFO, FAUX_MODELS } from "./agent";
import type { IntegrationEnv } from "./agent";
import { GATE_TOOL } from "./gate";
import { workspaceOf, workspaceToolsOf } from "./workspace";

const LAST = -1;

/**
 * The example session with Faux models, a gate tool that waits for the test, and methods that
 * tests call to script and inspect it.
 */
export class AgentHostSession extends BaseAgentHostSession<IntegrationEnv> {
  router = this.env.AGENT_ROUTER;
  host = this.env.AGENT_HOST;

  private faux = fauxProvider({
    provider: "faux",
    models: [{ id: "test" }, { id: "other", reasoning: true }],
    tokenSize: { min: 1, max: 1 },
  });
  // Each object starts with a closed gate, also after a restart.
  private gate = Promise.withResolvers<null>();
  private gateCalls = 0;

  workspace = workspaceOf(this.ctx.storage, this.env);
  registry = createRegistry();
  harness = new PiHarness({
    harness: async ({ storage, context, onWake }): Promise<Harness> => {
      await this.workspace.fs.mkdir(this.env.WORKSPACE_DIR, { recursive: true });

      const models = createModels();
      models.setProvider(this.faux.provider);

      this.registry.install({
        name: "workspace",
        tools: [...workspaceToolsOf(this.workspace), this.gateTool()],
      });

      return Harness.open(storage, { models, registry: this.registry, onWake }, context);
    },
    defaults: { model: FAUX_MODELS[0] },
  });
  sessionAlarms = new LifecycleSessionAlarms(this.ctx);
  lifecycle = Lifecycle.install(this).use(this.sessionAlarms).use(this.harness);

  async alarm(): Promise<void> {
    await this.lifecycle.alarm();
  }

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

  /** Returns true once Pi runs the gate tool in this object. */
  gateEntered(): boolean {
    return this.gateCalls > 0;
  }

  releaseGate(): void {
    this.gate.resolve(null);
  }

  /** Returns the model of the newest assistant message in the Pi sessions of this object. */
  async lastModel(): Promise<string | undefined> {
    const sessions = await this.harness.sessions.list();

    const transcripts = await Promise.all(
      sessions.map(async (info) => await this.harness.session(info.id).messages()),
    );

    const models = transcripts
      .flat()
      .flatMap((entry) => entry.model ?? [])
      .flatMap((message) => (message.role === "assistant" ? [message.model] : []));

    return models.at(LAST);
  }

  protected override createAlarmScheduler(
    options: SessionAlarmSchedulerOptions,
  ): SessionAlarmScheduler {
    return this.sessionAlarms.scheduler(options);
  }

  // A short heartbeat lets a test see the alarm continue a turn after a restart.
  protected override getLifecyclePolicy(): SessionLifecyclePolicy {
    return { ...super.getLifecyclePolicy(), turnHeartbeatMs: 500 };
  }

  protected getAgentInfo(): AgentInfo {
    return AGENT_INFO;
  }

  protected getWorkingDirectory(): string {
    return this.env.WORKSPACE_DIR;
  }

  protected async connectAgent(_sessionId: string): Promise<ACPStream> {
    await this.lifecycle.start();

    const { 0: client, 1: server } = new WebSocketPair();

    connectAcp({
      socket: server,
      harness: this.harness,
      cwd: this.env.WORKSPACE_DIR,
      models: FAUX_MODELS,
    });

    return websocketStream(client);
  }

  /** Returns a tool that waits until the test releases the gate. */
  private gateTool(): ToolRegistration {
    return {
      name: GATE_TOOL,
      description: "Waits until the test releases it.",
      parameters: Type.Object({}),
      // Pi runs the call again after a restart cuts it off.
      replay: "safe",
      execute: async () => {
        this.gateCalls += 1;
        await this.gate.promise;

        return { output: [{ type: "text", text: "released" }] };
      },
    };
  }
}
