import { defineConfig } from "drizzle-kit";

const config = defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  casing: "snake_case",
  schema: "./src/session/db/schema.ts",
  out: "./src/session/db/migrations",
});

export default config;
