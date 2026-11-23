// Creates a vendor on a throwaway in-memory Postgres (PGlite) and uses its key. No real database is touched.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { hmacSha256Hex } from "@etimaad/core";
import { apiKeys } from "@etimaad/db";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { authenticate } from "./auth";
import { PostgresStore } from "./postgres-store";
import { createVendorWithKey } from "./vendor-admin";

const SIGNING_KEY = "test-signing-key-0123456789-abcdefghij";
const migrationsDir = fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url));
const statements = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap((f) => readFileSync(join(migrationsDir, f), "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

describe("createVendorWithKey", () => {
  it("creates a vendor whose new key and signing secret work, and stores neither in plain text", async () => {
    const client = new PGlite();
    try {
      for (const s of statements) await client.exec(s);
      const db = drizzle(client);

      const created = await createVendorWithKey(
        db,
        {
          legalName: "Test Store (TEST)",
          displayName: "Test Store",
          category: "ecommerce",
          status: "ACTIVE",
          trustWeight: 1,
          kycReference: "TEST-VENDOR-NOT-KYC",
        },
        SIGNING_KEY,
      );
      expect(created.apiKey).toMatch(/^etm_[a-z0-9]{8}_[A-Za-z0-9]{32}$/);

      const [row] = await db.select().from(apiKeys);
      expect(JSON.stringify(row)).not.toContain(created.apiKey);
      expect(JSON.stringify(row)).not.toContain(created.signingSecret);

      const now = new Date();
      const body = '{"events":[]}';
      const timestamp = String(Math.floor(now.getTime() / 1000));
      const result = await authenticate({
        headers: new Headers({
          "x-api-key": created.apiKey,
          "x-timestamp": timestamp,
          "x-signature": hmacSha256Hex(created.signingSecret, `${timestamp}.${body}`),
        }),
        rawBody: body,
        now,
        store: new PostgresStore(db, { signingKey: SIGNING_KEY }),
        scope: "events:write",
        requireSignature: true,
      });
      expect(result.vendor.id).toBe(created.vendorId);
    } finally {
      await client.close();
    }
  });
});
