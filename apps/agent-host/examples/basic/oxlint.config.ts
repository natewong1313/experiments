import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["worker-configuration.d.ts"],
  overrides: [
    {
      // The example co-locates the three Durable Objects in one file.
      files: ["src/durable-objects.ts"],
      rules: { "eslint/max-classes-per-file": "off" },
    },
  ],
});
