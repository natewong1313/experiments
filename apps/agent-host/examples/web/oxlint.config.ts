import base from "@experiments/oxlint-config/base";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  ignorePatterns: [
    "worker-configuration.d.ts",
    "src/web/routeTree.gen.ts",
    "src/worker-env.d.ts",
    ".tanstack/",
  ],
  overrides: [
    {
      // The custom worker entrypoint re-exports the TanStack Start server entry
      // and the agent-host Durable Objects from a single module so the Worker
      // can serve the web app and host agent sessions.
      files: ["src/server.ts"],
      rules: {
        "typescript/explicit-function-return-type": "off",
      },
    },
    {
      // The example co-locates the three Durable Objects in one file.
      files: ["src/host/durable-objects.ts"],
      rules: { "eslint/max-classes-per-file": "off" },
    },
    {
      // TanStack derives the option-object and handler return types from
      // createFileRoute, createRootRoute, and createServerFn. Annotating them
      // adds no safety and fights the framework's inference.
      files: ["src/web/routes/**/*.tsx", "src/web/router.tsx"],
      rules: {
        "typescript/explicit-function-return-type": "off",
        "typescript/explicit-module-boundary-types": "off",
      },
    },
    {
      // React passes component callbacks as values, and the base config
      // requires method signatures in type literals, so every callback prop
      // would otherwise read as an unbound method.
      files: ["src/**/*.tsx"],
      rules: {
        "typescript/unbound-method": "off",
      },
    },
  ],
  rules: {
    // TanStack loads styles via `?url` query imports; the `.css` extension is
    // part of the asset path the Vite plugin resolves.
    "import/extensions": ["error", "never", { css: "always" }],
    // The AHP-protocol reducers are aliased with an `AHP` prefix to match the
    // other protocol imports, so their names start with an uppercase letter
    // even though they are plain functions, not constructors.
    "eslint/new-cap": ["error", { capIsNewExceptions: ["AHPsessionReducer", "AHPchatReducer"] }],
  },
});
