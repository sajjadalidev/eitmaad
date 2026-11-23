// Writes reference data (reason codes, scoring model v1). Safe to run again: existing rows are left as they are.

import type { PgDatabase } from "drizzle-orm/pg-core";
import { reasonCodes, scoreModelVersions } from "./schema";
import { reasonCodeRows, scoreModelRow } from "./seed-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDatabase = PgDatabase<any, any, any>;

export interface SeedResult {
  reasonCodesInserted: number;
  modelsInserted: number;
}

export async function seedReferenceData(db: AnyPgDatabase, now: Date): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const codes = await tx
      .insert(reasonCodes)
      .values(reasonCodeRows())
      .onConflictDoNothing()
      .returning({ code: reasonCodes.code });
    const models = await tx
      .insert(scoreModelVersions)
      .values(scoreModelRow(now))
      .onConflictDoNothing()
      .returning({ version: scoreModelVersions.version });
    return { reasonCodesInserted: codes.length, modelsInserted: models.length };
  });
}
