import { defineConfig } from "drizzle-kit";

const config = defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  casing: "snake_case",
  schema: "./src/host/db/schema.ts",
  out: "./src/host/db/migrations",
});

export default config;
