import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Postgres store tests start an in-memory database (PGlite) per test.
    testTimeout: 30_000,
  },
});
