import { defineConfig } from "drizzle-kit";

// `db:generate` only writes SQL files to ./migrations. It does not touch the database.
// There is no migrate script on purpose. Applying migrations needs explicit approval.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
