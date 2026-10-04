import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 90_000,
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
