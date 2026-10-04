import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["worker-configuration.d.ts"],
  rules: {
    "eslint/no-magic-numbers": [
      "error",
      {
        ignore: [0, 1],
        ignoreArrayIndexes: true,
      },
    ],
  },
});
