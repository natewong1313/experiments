import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  schema: "./src/state/persistence/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
});
