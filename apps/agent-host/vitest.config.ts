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

        durableObjects: {
          COORDINATORS: { className: "AgentHost", useSQLite: true },
          CONVERSATIONS: { className: "AgentSession", useSQLite: true },
          CONNECTIONS: { className: "ConnectionRouter", useSQLite: true },
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
