import { defineConfig } from "drizzle-kit";

const config = defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  casing: "snake_case",
  schema: "./src/router/db/schema.ts",
  out: "./src/router/db/migrations",
});

export default config;
