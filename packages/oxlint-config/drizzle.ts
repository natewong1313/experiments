import { defineConfig } from "oxlint";

import base from "@experiments/oxlint-config/base";

export default defineConfig({
  extends: [base],

  jsPlugins: ["eslint-plugin-drizzle"],
  rules: {
    "anti-slop/no-direct-sql-exec": "error",
    "drizzle/enforce-delete-with-where": "error",
    "drizzle/enforce-update-with-where": "error",
  },
});
