import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["worker-configuration.d.ts"],
  overrides: [
    {
      files: ["client/*.ts"],
      rules: {
        "unicorn/max-nested-calls": "off",
        "typescript/no-unsafe-enum-comparison": "off",
      },
    },
  ],
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
