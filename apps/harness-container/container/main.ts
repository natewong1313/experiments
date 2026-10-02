import { mkdir } from "node:fs/promises";
import * as z from "zod";
import { createBridge } from "./bridge.ts";

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
  throw new Error(
    "Missing Workers AI credentials or invalid bridge configuration",
  );
}

const config = parsed.data;

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
  process.stderr.write(
    `${JSON.stringify({ event: "bridge_listening", port: config.PORT })}\n`,
  );
});

async function shutdown(): Promise<void> {
  try {
    await bridge.close();
  } catch {
    process.exitCode = 1;
  }
}

process.once("SIGTERM", () => {
  void shutdown();
});

process.once("SIGINT", () => {
  void shutdown();
});
