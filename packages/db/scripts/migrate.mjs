// Applies pending SQL migrations to the database in DATABASE_MIGRATION_URL.
// This changes a real database. Run it only with explicit approval:
//   DATABASE_MIGRATION_URL=... node scripts/migrate.mjs --yes
// Use the Supabase "Session pooler" string (port 5432), not the transaction pooler.

import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes. This changes a real database.");
  process.exit(1);
}

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) {
  console.error("DATABASE_MIGRATION_URL is not set.");
  process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

async function applied() {
  const [exists] = await client`select to_regclass('drizzle.__drizzle_migrations') is not null as ok`;
  if (!exists.ok) return 0;
  const [row] = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
  return row.n;
}

try {
  const before = await applied();
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  const after = await applied();
  console.log(`Migrations applied before: ${before}, after: ${after}, new: ${after - before}`);
} catch (error) {
  console.error("Migration failed:", error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "[url]") : error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
