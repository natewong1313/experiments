import base from "@experiments/oxlint-config/base";
import drizzle from "@experiments/oxlint-config/drizzle";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base, drizzle],
  ignorePatterns: ["worker-configuration.d.ts", "src/**/db/migrations/**"],
  overrides: [
    {
      files: ["src/rpc/*.ts"],
      rules: {
        "typescript/consistent-type-definitions": "off",
        "eslint/max-classes-per-file": "off",
      },
    },
    {
      // Zod declarations compose schemas through nested calls.
      files: ["src/protocol.ts", "src/host/connections.ts", "src/host/durable-object.ts"],
      rules: { "unicorn/max-nested-calls": "off" },
    },
    {
      files: ["test/**/*.ts"],
      rules: { "eslint/max-nested-callbacks": ["error", { max: 3 }] },
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
    "drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: ["db"] }],
    "drizzle/enforce-update-with-where": ["error", { drizzleObjectName: ["db"] }],
    "eslint/no-magic-numbers": ["error", { ignore: [0, 1], ignoreArrayIndexes: true }],
    "eslint/no-underscore-dangle": ["error", { allow: ["_meta"] }],
  },
});
