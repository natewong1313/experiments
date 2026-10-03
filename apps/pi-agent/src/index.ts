import { DurableObject } from "cloudflare:workers";
import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { createModels, MutableModels } from "@earendil-works/pi-ai/models";
import { PiHarness, type PiHarnessOptions } from "agents/harnesses/pi";
import { Lifecycle } from "agents/lifecycle";
import { CLOUDFLARE_PROVIDER_ID, createAI } from "agents/models/pi-ai";
import { connectAcp } from "./acp";
import {
  createWorkspaceTools,
  JAVASCRIPT_BACKEND,
  workspaceStorage,
} from "./workspace";

// Hardcoded env since this class is extendable.
export type PiAgentEnv = {
  AI: Ai;
  LOADER: WorkerLoader;
};

const WORKSPACE_DIR = "/workspace";

export class PiAgent<
  Env extends PiAgentEnv = PiAgentEnv,
> extends DurableObject<Env> {
  readonly workspace = new Workspace({
    storage: workspaceStorage(this.ctx.storage),
    git: createGitClient(),
    backends: [
      new WorkerJavaScriptBackend({
        id: JAVASCRIPT_BACKEND,
        loader: this.env.LOADER,
        root: WORKSPACE_DIR,
        access: "read-write",
        allowGitNetwork: true,
      }),
    ],
  });
  readonly registry = createRegistry();
  readonly harness = new PiHarness({
    harness: async ({ storage, context }): Promise<Harness> => {
      // Setup the workspace.
      await this.workspace.fs.mkdir(WORKSPACE_DIR, {
        recursive: true,
      });
      const models = this.setupModels();
      this.registry.batch(() => {
        this.registry.systemPrompt.section(
          "preamble",
          () =>
            `You are a concise coding assistant. Your durable workspace is ${WORKSPACE_DIR}. Use read, write, edit, delete, ls, find, grep and exec to work with files. exec runs JavaScript modules, not shell commands. Paths are absolute.`,
          { tag: false },
        );

        for (const tool of createWorkspaceTools(this.workspace)) {
          this.registry.tools.add(tool);
        }
      });

      return Harness.open(
        storage,
        { models, registry: this.registry },
        context,
      );
    },
    defaults: this.getSessionDefaults(),
  });
  readonly lifecycle = Lifecycle.install(this).use(this.harness);
  private connectedSocket: WebSocket | null = null;

  protected getSessionDefaults(): PiHarnessOptions["defaults"] {
    return {
      model: {
        provider: CLOUDFLARE_PROVIDER_ID,
        modelId: "@cf/moonshotai/kimi-k2.7-code",
      },
      thinkingLevel: "low",
      retry: { enabled: true, maxRetries: 2, baseDelayMs: 500 },
    };
  }

  protected setupModels(): MutableModels {
    const models = createModels();
    const ai = createAI({ binding: this.env.AI });

    models.setProvider(ai.provider);

    return models;
  }

  override async fetch(request: Request): Promise<Response> {
    if (
      request.method !== "GET" ||
      request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
    ) {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    await this.lifecycle.start();

    if (
      this.connectedSocket !== null &&
      this.connectedSocket.readyState === WebSocket.OPEN
    ) {
      return new Response("Agent already has a connection", { status: 409 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.connectedSocket = server;
    server.accept();
    connectAcp({
      socket: server,
      harness: this.harness,
      cwd: WORKSPACE_DIR,
    });
    server.addEventListener("close", () => {
      if (this.connectedSocket === server) {
        this.connectedSocket = null;
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
