import { DurableObject } from "cloudflare:workers";

const PORT = 8080;

const INACTIVITY_TIMEOUT_MS = 600_000;

const READINESS_TIMEOUT_MS = 30_000;

const POLL_INTERVAL_MS = 200;

export type HarnessContainerEnv = {
  CLOUDFLARE_API_KEY: string;
  CLOUDFLARE_ACCOUNT_ID: string;
};

export class HarnessContainer<
  Environment extends HarnessContainerEnv = HarnessContainerEnv,
> extends DurableObject<Environment> {
  protected port = PORT;
  protected inactivityTimeoutMs = INACTIVITY_TIMEOUT_MS;
  protected readinessTimeoutMs = READINESS_TIMEOUT_MS;
  protected pollIntervalMs = POLL_INTERVAL_MS;
  private ready: Promise<void> | null = null;

  protected getContainerEnv(): HarnessContainerEnv {
    const { CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID } = this.env;

    if (!CLOUDFLARE_API_KEY || !CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("Cloudflare Workers AI credentials are missing");
    }

    return { CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID };
  }

  async fetch(request: Request): Promise<Response> {
    const { container } = this.ctx;
    const containerId = this.ctx.id.toString();
    const startedAt = Date.now();
    console.info({
      event: "container_request",
      containerId,
      method: request.method,
      websocket: request.headers.get("Upgrade")?.toLowerCase() === "websocket",
    });

    if (!container) {
      console.error({ event: "container_binding_missing", containerId });

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

      const response = await container.getTcpPort(this.port).fetch(forwarded);
      console.info({
        event: "container_request_forwarded",
        containerId,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
      });

      return response;
    } catch (error) {
      console.error({
        event: "container_request_failed",
        containerId,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
      this.ready = null;

      return new Response("Agent container is unavailable", { status: 503 });
    }
  }

  private async startAndWait(): Promise<void> {
    const { container } = this.ctx;
    const containerId = this.ctx.id.toString();
    const startedAt = Date.now();

    if (!container) {
      throw new Error("Container binding is missing");
    }

    if (!container.running) {
      console.info({ event: "container_starting", containerId });
      container.start({
        enableInternet: true,
        env: this.getContainerEnv(),
      });
    }

    await container.setInactivityTimeout(this.inactivityTimeoutMs);
    console.info({
      event: "container_waiting_for_health",
      containerId,
      port: this.port,
      timeoutMs: this.readinessTimeoutMs,
    });
    await this.waitForHealth(Date.now() + this.readinessTimeoutMs);
    console.info({
      event: "container_ready",
      containerId,
      elapsedMs: Date.now() - startedAt,
    });
  }

  private async waitForHealth(deadline: number): Promise<void> {
    const { container } = this.ctx;

    if (!container) {
      throw new Error("Container binding is missing");
    }

    let failure: string;

    try {
      const response = await container
        .getTcpPort(this.port)
        .fetch("http://container/health");

      if (response.ok) {
        return;
      }

      failure = `HTTP ${response.status}`;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }

    if (Date.now() >= deadline) {
      console.error({
        event: "container_readiness_timeout",
        containerId: this.ctx.id.toString(),
        port: this.port,
        error: failure,
      });
      throw new Error("Agent container did not become ready");
    }

    await scheduler.wait(this.pollIntervalMs);
    await this.waitForHealth(deadline);
  }
}
