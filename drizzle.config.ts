import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/infra/postgres/schema.ts",
  out: "./drizzle",
});
