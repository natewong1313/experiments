import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["oxlint.config.ts"],
  overrides: [
    {
      files: ["raw.ts", "test-peer.ts"],
      rules: {
        "promise/avoid-new": "off",
        "promise/no-multiple-resolved": "off",
      },
    },
    {
      files: ["*.test.ts"],
      rules: {
        "eslint/no-magic-numbers": "off",
        "eslint/max-nested-callbacks": "off",
        "unicorn/max-nested-calls": "off",
        "vitest/no-standalone-expect": "off",
        "vitest/expect-expect": [
          "error",
          {
            assertFunctionNames: [
              "expect",
              "expectState",
              "expectRootState",
              "expectSessionState",
              "expectChatState",
              "expectRpcError",
            ],
          },
        ],
      },
    },
  ],
});
