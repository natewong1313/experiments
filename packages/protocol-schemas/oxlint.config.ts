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
    "unicorn/max-nested-calls": "off",
    "oxc/no-barrel-file": "off",
    "eslint/no-underscore-dangle": [
      "error",
      {
        allow: ["_meta"],
      },
    ],
  },
  overrides: [
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
        "eslint/max-lines": "off",
        "unicorn/numeric-separators-style": "off",
      },
    },
    {
      files: ["scripts/**"],
      rules: {
        "eslint/no-magic-numbers": "off",
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
