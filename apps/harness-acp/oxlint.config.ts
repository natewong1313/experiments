import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  rules: {
    "eslint/no-magic-numbers": ["error", { ignore: [-1, 0, 1], ignoreArrayIndexes: true }],
    "eslint/no-underscore-dangle": ["error", { allow: ["_meta"] }],
    "typescript/switch-exhaustiveness-check": [
      "error",
      { considerDefaultExhaustiveForUnions: true },
    ],
  },
  overrides: [
    {
      // ACP updates must retain their order across asynchronous transport writes.
      files: ["src/index.ts", "src/pi.ts", "src/opencode.ts"],
      rules: { "eslint/no-await-in-loop": "off" },
    },
    {
      // Tool values remain opaque until JSON serialization at the ACP boundary.
      files: ["src/acp-events.ts", "src/frame-limits.ts"],
      rules: { "anti-slop/no-unknown-parameters": "off" },
    },
    {
      // These event parameters select variants from Pi's native event union.
      files: ["src/acp-events.ts"],
      rules: { "anti-slop/no-inline-object-parameters": "off" },
    },
    {
      files: ["src/frame-limits.ts"],
      rules: {
        "eslint/no-magic-numbers": "off",
        "anti-slop/no-unknown-returns": "off",
        // JSON.stringify can return undefined for non-JSON values.
        "typescript/no-unnecessary-condition": "off",
      },
    },
    {
      files: ["src/websocket-stream.ts"],
      rules: { "unicorn/max-nested-calls": ["error", { max: 4 }] },
    },
    {
      files: ["src/pi.ts"],
      rules: { "eslint/max-nested-callbacks": ["error", { max: 3 }] },
    },
  ],
});
