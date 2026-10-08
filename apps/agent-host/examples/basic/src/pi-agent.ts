import { DurableObject } from "cloudflare:workers";
import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { createModels, type MutableModels } from "@earendil-works/pi-ai/models";
import { PiHarness, type PiHarnessOptions } from "agents/harnesses/pi";
import { Lifecycle } from "agents/lifecycle";
import { CLOUDFLARE_PROVIDER_ID, createAI } from "agents/models/pi-ai";
import { connectAcp } from "@experiments/pi-acp";
import { createWorkspaceTools, JAVASCRIPT_BACKEND, workspaceStorage } from "./workspace";

const STATUS_UPGRADE_REQUIRED = 426;
const STATUS_SWITCHING_PROTOCOLS = 101;

// A pi harness running on a DO that accepts ACP calls over websockets.
export class PiAgent extends DurableObject<Env> {
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
      const models = this.setupModels();
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
    defaults: this.getSessionDefaults(),
  });
  lifecycle = Lifecycle.install(this).use(this.harness);
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
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: STATUS_UPGRADE_REQUIRED });
    }

    await this.lifecycle.start();

    // We expect at most one host to "own" this
    if (this.connectedSocket !== null && this.connectedSocket.readyState === WebSocket.OPEN) {
      return new Response("Agent already has a connection", { status: 409 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.connectedSocket = server;
    server.accept();
    server.addEventListener("close", () => {
      if (this.connectedSocket === server) {
        this.connectedSocket = null;
      }
    });

    connectAcp({
      socket: server,
      harness: this.harness,
      cwd: this.env.WORKSPACE_DIR,
    });

    return new Response(null, { status: STATUS_SWITCHING_PROTOCOLS, webSocket: client });
  }
}
