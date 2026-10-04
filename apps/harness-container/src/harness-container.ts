import { DurableObject } from "cloudflare:workers";

const PORT = 8080;
const INACTIVITY_TIMEOUT_MS = 600_000;
const READINESS_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 200;

class HarnessContainer extends DurableObject<Env> {
  private ready: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const { container } = ctx;
    if (container?.running === true) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
    }
  }

  async fetch(request: Request): Promise<Response> {
    const { container } = this.ctx;
    if (!container) {
      return new Response("Container binding is missing", { status: 503 });
    }
    if (!container.running) {
      this.ready = null;
    }
    this.ready ??= this.startAndWait();
    try {
      await this.ready;
      const url = new URL("http://container/acp");
      const forwarded = new Request(url, request);
      forwarded.headers.delete("host");
      return await container.getTcpPort(PORT).fetch(forwarded);
    } catch {
      this.ready = null;
      return new Response("Agent container is unavailable", { status: 503 });
    }
  }

  private async startAndWait(): Promise<void> {
    const { container } = this.ctx;
    if (!container) {
      throw new Error("Container binding is missing");
    }
    if (!this.env.CLOUDFLARE_API_KEY || !this.env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("Cloudflare Workers AI credentials are missing");
    }
    if (!container.running) {
      container.start({
        enableInternet: true,
        env: {
          CLOUDFLARE_API_KEY: this.env.CLOUDFLARE_API_KEY,
          CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID,
        },
      });
    }
    try {
      await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
      await this.waitForHealth(Date.now() + READINESS_TIMEOUT_MS);
    } catch (error) {
      this.ready = null;
      throw error;
    }
  }

  private async waitForHealth(deadline: number): Promise<void> {
    const { container } = this.ctx;
    if (!container) {
      throw new Error("Container binding is missing");
    }
    try {
      const response = await container.getTcpPort(PORT).fetch("http://container/health");
      if (response.ok) {
        return;
      }
    } catch {}
    if (Date.now() >= deadline) {
      throw new Error("Agent container did not become ready");
    }
    await scheduler.wait(POLL_INTERVAL_MS);
    await this.waitForHealth(deadline);
  }
}

export { HarnessContainer };
