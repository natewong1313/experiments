import base from "@experiments/oxlint-config/base";
import drizzle from "@experiments/oxlint-config/drizzle";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base, drizzle],
  ignorePatterns: ["worker-configuration.d.ts"],
  overrides: [
    {
      files: ["test/**/*.ts"],
      rules: {
        "eslint/max-nested-callbacks": [
          "error",
          {
            max: 3,
          },
        ],
      },
    },
    {
      files: ["src/state/reducers.ts"],
      rules: {
        "typescript/consistent-type-assertions": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "eslint/no-magic-numbers": "off",
      },
    },
    {
      files: ["src/storage/json-documents.ts"],
      rules: {
        "typescript/no-unnecessary-type-parameters": "off",
        "typescript/consistent-type-assertions": "off",
        "typescript/no-unsafe-type-assertion": "off",
      },
    },
    {
      files: ["src/deadline.ts"],
      rules: {
        "promise/avoid-new": "off",
      },
    },
    {
      files: ["src/ahp/protocol.ts", "src/agent/acp.ts"],
      rules: {
        "unicorn/max-nested-calls": "off",
        "zod/prefer-tuple-over-array-length": "off",
      },
    },
    {
      files: ["src/ahp/clients.ts"],
      rules: {
        "zod/prefer-tuple-over-array-length": "off",
      },
    },
    {
      files: ["src/ahp/validation.ts"],
      rules: {
        "typescript/switch-exhaustiveness-check": [
          "error",
          {
            considerDefaultExhaustiveForUnions: true,
          },
        ],
      },
    },
    {
      files: ["test/env.d.ts"],
      rules: {
        "typescript/consistent-type-definitions": "off",
        "typescript/no-empty-object-type": "off",
      },
    },
  ],
  rules: {
    "drizzle/enforce-delete-with-where": [
      "error",
      {
        drizzleObjectName: ["db"],
      },
    ],
    "drizzle/enforce-update-with-where": [
      "error",
      {
        drizzleObjectName: ["db"],
      },
    ],
    "eslint/no-magic-numbers": [
      "error",
      {
        ignore: [0, 1],
        ignoreArrayIndexes: true,
      },
    ],
    "eslint/no-underscore-dangle": [
      "error",
      {
        allow: ["_meta"],
      },
    ],
  },
});
