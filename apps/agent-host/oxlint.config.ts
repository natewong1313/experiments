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
      // Test fixtures inspect Durable Object storage directly; production code
      // must use drizzle (see `anti-slop/no-direct-sql-exec`).
      files: ["test/**/*.ts"],
      rules: {
        "anti-slop/no-direct-sql-exec": "off",
      },
    },
    {
      // Timer APIs need an executor to reject the deadline promise.
      files: ["src/deadline.ts"],
      rules: {
        "promise/avoid-new": "off",
      },
    },
    {
      // Schema composition nests calls; subscription arrays have variable length.
      files: ["src/ahp/protocol.ts"],
      rules: {
        "unicorn/max-nested-calls": "off",
        "zod/prefer-tuple-over-array-length": "off",
      },
    },
    {
      // This array has an upper bound rather than fixed tuple positions.
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
      // Cloudflare environment types require declaration merging.
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
