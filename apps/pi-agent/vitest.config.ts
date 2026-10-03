import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./test/worker.ts",
      miniflare: {
        compatibilityDate: "2026-09-28",
        compatibilityFlags: ["nodejs_compat"],
        workerLoaders: { LOADER: {} },
        durableObjects: {
          HARNESS: { className: "TestHarness", useSQLite: true },
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
