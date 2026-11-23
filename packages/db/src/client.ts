import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase transaction pooler does not support prepared statements, so they are turned off.
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
