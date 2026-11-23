// Writes reference data (16 reason codes, scoring model v1) to the database in DATABASE_MIGRATION_URL.
// This writes to a real database. Run it only with explicit approval:
//   DATABASE_MIGRATION_URL=... pnpm db:seed-reference --yes
// Existing rows are never changed.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seedReferenceData } from "../src/seed";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes. This writes to a real database.");
  process.exit(1);
}

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error("DATABASE_MIGRATION_URL is not set.");
  process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  const result = await seedReferenceData(drizzle(client), new Date());
  console.log(`Reason codes inserted: ${result.reasonCodesInserted}, scoring models inserted: ${result.modelsInserted}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Seed failed:", message.replace(/postgres(ql)?:\/\/\S+/g, "[url]"));
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
