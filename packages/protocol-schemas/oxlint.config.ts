import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["oxlint.config.ts"],
  rules: {
    "zod/consistent-object-schema-type": [
      "error",
      {
        allow: ["strictObject"],
      },
    ],
    "eslint/no-underscore-dangle": [
      "error",
      {
        allow: ["_meta"],
      },
    ],
  },
  overrides: [
    {
      // Nested calls express schema structure directly.
      files: ["src/**"],
      rules: { "unicorn/max-nested-calls": "off" },
    },
    {
      // These are public package entrypoints and the generated schema entrypoint.
      files: ["src/ahp/index.ts", "src/acp/index.ts", "src/acp/generated/index.ts"],
      rules: { "oxc/no-barrel-file": "off" },
    },
    {
      files: ["src/acp/**"],
      rules: {
        "zod/consistent-object-schema-type": [
          "error",
          {
            allow: ["strictObject", "looseObject"],
          },
        ],
        "eslint/no-magic-numbers": [
          "error",
          {
            ignore: [0],
          },
        ],
      },
    },
    {
      files: ["test/**"],
      rules: {
        "eslint/no-magic-numbers": "off",
      },
    },
    {
      files: ["src/acp/generated/**"],
      rules: {
        "eslint/no-magic-numbers": "off",
        "unicorn/numeric-separators-style": "off",
      },
    },
    {
      files: ["scripts/generate-acp.mjs"],
      rules: {
        "eslint/no-magic-numbers": ["error", { ignore: [-1, 0, 1], ignoreArrayIndexes: true }],
      },
    },
    {
      files: ["test/acp-coverage.test.ts"],
      rules: {
        "import/extensions": [
          "error",
          "never",
          {
            json: "always",
          },
        ],
      },
    },
  ],
});
