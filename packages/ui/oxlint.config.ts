import reactInternal from "@experiments/oxlint-config/react-internal";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [reactInternal],
  ignorePatterns: ["oxlint.config.ts"],
});
