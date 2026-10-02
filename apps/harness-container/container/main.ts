import { mkdir } from "node:fs/promises";
import * as z from "zod";
import { createBridge } from "./bridge.ts";
import { logEvent } from "./logging.ts";

const MIN_CREDENTIAL_LENGTH = 1;

const MAX_PORT = 65_535;

const DEFAULT_PORT = 8080;

const ConfigSchema = z.object({
  CLOUDFLARE_API_KEY: z.string().trim().min(MIN_CREDENTIAL_LENGTH),
  CLOUDFLARE_ACCOUNT_ID: z.string().trim().min(MIN_CREDENTIAL_LENGTH),
  WORKSPACE_DIR: z.string().default("/workspace"),
  PORT: z.coerce.number().int().positive().max(MAX_PORT).default(DEFAULT_PORT),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  logEvent("bridge_config_invalid");
  throw new Error(
    "Missing Workers AI credentials or invalid bridge configuration",
  );
}

const config = parsed.data;

logEvent("bridge_starting", {
  port: config.PORT,
  workspace: config.WORKSPACE_DIR,
});

await mkdir(config.WORKSPACE_DIR, { recursive: true });

const bridge = createBridge({
  workspace: config.WORKSPACE_DIR,
  command: "pi-acp",
  args: [],
  env: {
    ...process.env,
    PI_ACP_PI_COMMAND:
      process.env.PI_ACP_PI_COMMAND ??
      new URL("./pi.sh", import.meta.url).pathname,
  },
});

bridge.server.listen(config.PORT, "0.0.0.0", () => {
  logEvent("bridge_listening", { port: config.PORT });
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logEvent("bridge_shutdown", { signal });

  try {
    await bridge.close();
    logEvent("bridge_closed");
  } catch (error) {
    logEvent("bridge_shutdown_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
