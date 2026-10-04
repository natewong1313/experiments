import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["oxlint.config.ts"],
  overrides: [
    {
      // These modules adapt WebSocket events and callbacks into promises.
      files: ["raw.ts", "test-peer.ts"],
      rules: {
        "promise/avoid-new": "off",
      },
    },
    {
      files: ["*.test.ts"],
      rules: {
        "eslint/no-magic-numbers": "off",
        "eslint/max-nested-callbacks": ["error", { max: 4 }],
        "unicorn/max-nested-calls": "off",
        // Oxlint does not recognize all callbacks under our extended test fixture.
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
