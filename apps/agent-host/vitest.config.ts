import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "sql-text",
      enforce: "pre",
      transform(source, id): { code: string; map: null; moduleType: "js" } | null {
        if (id.endsWith(".sql")) {
          return {
            code: `export default ${JSON.stringify(source)};`,
            map: null,
            moduleType: "js",
          };
        }

        return null;
      },
    },
    cloudflareTest({
      main: "./test/worker.ts",
      miniflare: {
        compatibilityDate: "2026-09-28",
        compatibilityFlags: ["nodejs_compat"],
        workerLoaders: { LOADER: {} },
        durableObjects: {
          AGENT_HOST: { className: "AgentHost", useSQLite: true },
          CUSTOM_HOST: { className: "CustomHost", useSQLite: true },
          ACP_BACKEND: { className: "AcpBackend", useSQLite: true },
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
