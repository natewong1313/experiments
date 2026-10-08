import reactInternal from "@experiments/oxlint-config/react-internal";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [reactInternal],
  // The UI directory contains the vendored shadcn components.
  ignorePatterns: ["src/routeTree.gen.ts", "worker-configuration.d.ts", "src/components/ui/**"],
  rules: {
    "react/jsx-max-depth": [
      "error",
      {
        max: 8,
      },
    ],
  },
  overrides: [
    {
      // This file's own rule options contain numeric literals.
      files: ["oxlint.config.ts"],
      rules: {
        "eslint/no-magic-numbers": "off",
      },
    },
    {
      // Register is a module augmentation interface.
      files: ["src/router.tsx"],
      rules: {
        "typescript/consistent-type-definitions": "off",
      },
    },
    {
      files: ["src/routes/__root.tsx"],
      rules: {
        "import/extensions": [
          "error",
          "never",
          {
            css: "always",
          },
        ],
      },
    },
    {
      files: ["src/lib/ahp/dispatch.ts"],
      rules: {
        "promise/avoid-new": "off",
      },
    },
    {
      files: ["src/pi-agent.ts"],
      rules: {
        "eslint/no-magic-numbers": [
          "error",
          {
            ignore: [0, 1],
            ignoreArrayIndexes: true,
          },
        ],
      },
    },
    {
      // Route modules export route objects rather than component-only modules.
      files: ["src/routes/**"],
      rules: {
        "react/only-export-components": "off",
      },
    },
    {
      // Private components stay beside their sole callers.
      files: ["src/routes/sessions.$sessionId.tsx", "src/lib/hooks/AgentHostProvider.tsx"],
      rules: {
        "react/no-multi-comp": "off",
      },
    },
    {
      // The useSyncExternalStore hook requires a subscription callback.
      files: ["src/lib/hooks/use-mobile.ts"],
      rules: {
        "promise/prefer-await-to-callbacks": "off",
      },
    },
    {
      // The SDK appends response parts or updates them in their existing positions.
      files: ["src/features/sessions/AgentResponse.tsx"],
      rules: {
        "react/no-array-index-key": "off",
      },
    },
    {
      // PageHeader accepts JSX through its breadcrumbs slot.
      files: ["src/routes/sessions.$sessionId.tsx"],
      rules: {
        "react-perf/jsx-no-jsx-as-prop": "off",
      },
    },
    {
      // The devtools API accepts plugin descriptors with JSX render values.
      files: ["src/routes/__root.tsx"],
      rules: {
        "react-perf/jsx-no-new-array-as-prop": "off",
      },
    },
    {
      // These handlers capture row values or invoke ordinary DOM/UI actions.
      files: [
        "src/components/SidebarNavigation.tsx",
        "src/features/sessions/Conversation.tsx",
        "src/features/sessions/CreateSessionButton.tsx",
        "src/features/sessions/SessionList.tsx",
        "src/routes/index.tsx",
      ],
      rules: {
        "react-perf/jsx-no-new-function-as-prop": "off",
      },
    },
    {
      // Router search/params and DOM style props are value objects, not memoization contracts.
      files: [
        "src/components/SidebarNavigation.tsx",
        "src/features/sessions/SessionList.tsx",
        "src/routes/__root.tsx",
        "src/routes/index.tsx",
        "src/routes/sessions.$sessionId.tsx",
      ],
      rules: {
        "react-perf/jsx-no-new-object-as-prop": "off",
      },
    },
  ],
});
