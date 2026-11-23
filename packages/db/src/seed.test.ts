// Runs the reference seed on a throwaway in-memory Postgres (PGlite). No real database is touched.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { REASON_CODES, REASON_CODE_CATALOGUE, SCORE_MODEL_V1 } from "@etimaad/core";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { reasonCodes, scoreModelVersions } from "./schema";
import { seedReferenceData } from "./seed";

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
const statements = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap((f) => readFileSync(join(migrationsDir, f), "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

describe("seedReferenceData", () => {
  it("writes every reason code and model v1 exactly as in the code, and is safe to run again", async () => {
    const client = new PGlite();
    try {
      for (const s of statements) await client.exec(s);
      const db = drizzle(client);
      const now = new Date("2026-11-23T00:00:00Z");

      expect(await seedReferenceData(db, now)).toEqual({ reasonCodesInserted: 16, modelsInserted: 1 });
      expect(await seedReferenceData(db, now)).toEqual({ reasonCodesInserted: 0, modelsInserted: 0 });

      const codes = await db.select().from(reasonCodes);
      expect(codes.map((c) => c.code).sort()).toEqual([...REASON_CODES].sort());
      for (const row of codes) {
        const def = REASON_CODE_CATALOGUE[row.code as keyof typeof REASON_CODE_CATALOGUE];
        expect(row.derivedFault).toBe(def.derivedFault);
        expect(row.severityWeight).toBe(def.severityWeight);
        expect(row.minDeliveryAttempts).toBe(def.minDeliveryAttempts);
        expect([...row.validStatuses].sort()).toEqual([...def.validStatuses].sort());
      }

      const [model] = await db.select().from(scoreModelVersions);
      expect(model?.version).toBe(1);
      expect(model?.params).toEqual(JSON.parse(JSON.stringify(SCORE_MODEL_V1)));
    } finally {
      await client.close();
    }
  });
});
