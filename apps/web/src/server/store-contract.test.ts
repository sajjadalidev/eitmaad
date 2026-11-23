// The same API scenarios run against both stores: in-memory and Postgres.
// Postgres runs on PGlite, a throwaway in-memory database. No real database is touched.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sha256Hex, type VendorStatus } from "@etimaad/core";
import { apiKeys, reasonCodeRows, reasonCodes, scoreModelRow, scoreModelVersions, vendors } from "@etimaad/db";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { authenticate } from "./auth";
import { ingestEvents } from "./ingest";
import { InMemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";
import { riskCheck } from "./risk";
import { sealSecret } from "./secret-box";
import type { EtimaadStore, VendorRecord } from "./store";
import { ALL_SCOPES, NOW, PEPPER, event, keyFor, refusal, secretFor, signedHeaders } from "./test-helpers";

const SIGNING_KEY = "test-signing-key-0123456789-abcdefghij";
const LETTERS = ["a", "b", "c", "d"] as const;
type Letter = (typeof LETTERS)[number];
const VENDOR_ID: Record<Letter, string> = {
  a: "00000000-0000-4000-8000-0000000000a1",
  b: "00000000-0000-4000-8000-0000000000b1",
  c: "00000000-0000-4000-8000-0000000000c1",
  d: "00000000-0000-4000-8000-0000000000d1",
};

interface Harness {
  store: EtimaadStore;
  close: () => Promise<void>;
}

const migrationsDir = fileURLToPath(new URL("../../../../packages/db/migrations", import.meta.url));
const statements = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .flatMap((f) => readFileSync(join(migrationsDir, f), "utf8").split("--> statement-breakpoint"))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function memoryHarness(statuses: Partial<Record<Letter, VendorStatus>> = {}): Promise<Harness> {
  const store = new InMemoryStore();
  for (const l of LETTERS) {
    store.addVendor({
      id: VENDOR_ID[l],
      displayName: `Vendor ${l}`,
      status: statuses[l] ?? "ACTIVE",
      trustWeight: 1,
      faultClaimBias: 1,
      settings: {},
    });
    store.addApiKey(
      {
        id: `key-${l}`,
        vendorId: VENDOR_ID[l],
        keyPrefix: `test${l.repeat(4)}`,
        keyHash: sha256Hex(keyFor(l)),
        scopes: ALL_SCOPES,
        signingSecretRef: `ref-${l}`,
        status: "ACTIVE",
        expiresAt: null,
      },
      secretFor(l),
    );
  }
  return { store, close: async () => {} };
}

async function postgresHarness(statuses: Partial<Record<Letter, VendorStatus>> = {}): Promise<Harness> {
  const client = new PGlite();
  for (const statement of statements) await client.exec(statement);
  // The migration creates partitions from the real date; make sure the test month exists too.
  for (const table of ["order_events", "lookup_audit_log"]) {
    await client.query(`select ensure_monthly_partition($1, $2::date)`, [table, NOW.toISOString().slice(0, 10)]);
  }

  const db = drizzle(client);
  await db.insert(scoreModelVersions).values(scoreModelRow(NOW));
  await db.insert(reasonCodes).values(reasonCodeRows());
  for (const l of LETTERS) {
    await db.insert(vendors).values({
      id: VENDOR_ID[l],
      legalName: `Vendor ${l} Pvt Ltd`,
      displayName: `Vendor ${l}`,
      category: "ecommerce",
      status: statuses[l] ?? "ACTIVE",
      trustWeight: 1,
      faultClaimBias: 1,
      settings: {},
    });
    await db.insert(apiKeys).values({
      vendorId: VENDOR_ID[l],
      keyPrefix: `test${l.repeat(4)}`,
      keyHash: sha256Hex(keyFor(l)),
      scopes: [...ALL_SCOPES],
      signingSecretRef: sealSecret(secretFor(l), SIGNING_KEY),
    });
  }
  return { store: new PostgresStore(db, { signingKey: SIGNING_KEY }), close: () => client.close() };
}

const HARNESSES = [
  ["in-memory store", memoryHarness],
  ["Postgres store (PGlite)", postgresHarness],
] as const;

async function vendorOf(store: EtimaadStore, l: Letter): Promise<VendorRecord> {
  const v = await store.getVendor(VENDOR_ID[l]);
  if (!v) throw new Error(`Missing vendor ${l}`);
  return v;
}

const ctx = (store: EtimaadStore) => ({ store, pepper: PEPPER, keyVersion: 1, now: NOW });

async function report(store: EtimaadStore, l: Letter, events: unknown[]) {
  return ingestEvents(ctx(store), await vendorOf(store, l), { events });
}

async function check(store: EtimaadStore, l: Letter, phone: string, orderValue = 3000) {
  const apiKey = await store.findApiKeyByPrefix(`test${l.repeat(4)}`);
  if (!apiKey) throw new Error(`Missing API key for ${l}`);
  return riskCheck(ctx(store), await vendorOf(store, l), apiKey.id, { phone, order_value_pkr: orderValue });
}

async function withHarness(make: () => Promise<Harness>, run: (store: EtimaadStore) => Promise<void>) {
  const h = await make();
  try {
    await run(h.store);
  } finally {
    await h.close();
  }
}

describe.each(HARNESSES)("%s", (_name, make) => {
  it("authenticates a signed request", async () => {
    await withHarness(make, async (store) => {
      const body = '{"events":[]}';
      const result = await authenticate({
        headers: signedHeaders("a", body),
        rawBody: body,
        now: NOW,
        store,
        scope: "events:write",
        requireSignature: true,
      });
      expect(result.vendor.id).toBe(VENDOR_ID.a);
    });
  });

  it("accepts, deduplicates and detects conflicts", async () => {
    await withHarness(make, async (store) => {
      const e = event();
      expect((await report(store, "a", [e])).body.results[0]?.result).toBe("ACCEPTED");
      expect((await report(store, "a", [e])).body.results[0]?.result).toBe("DUPLICATE");
      expect((await report(store, "a", [{ ...e, order_value_pkr: 1 }])).body.results[0]?.code).toBe(
        "IDEMPOTENCY_CONFLICT",
      );
    });
  });

  it("handles the same event sent twice at the same time", async () => {
    await withHarness(make, async (store) => {
      const e = event();
      const [first, second] = await Promise.all([report(store, "a", [e]), report(store, "a", [e])]);
      const results = [first.body.results[0]?.result, second.body.results[0]?.result].sort();
      expect(results).toEqual(["ACCEPTED", "DUPLICATE"]);
    });
  });

  it("applies corrections to the stored order", async () => {
    await withHarness(make, async (store) => {
      const r = refusal();
      await report(store, "a", [r]);
      const fix = { ...r, event_id: `${String(r.event_id)}-fix`, reason_code: "RIDER_ISSUE", is_correction: true };
      expect((await report(store, "a", [fix])).body.results[0]?.result).toBe("ACCEPTED");
      const order = await store.findOrder(VENDOR_ID.a, String(r.external_order_ref));
      expect(order?.derivedFault).toBe("LOGISTICS");
      expect(order?.version).toBe(2);
    });
  });

  it("marks refusals from 2 merchants as HIGH", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [refusal({ phone: "03004444444" })]);
      await report(store, "b", [refusal({ phone: "03004444444" })]);
      const r = await check(store, "c", "03004444444");
      expect(r.risk_tier).toBe("HIGH");
      expect(r.recommended_action).toBe("PREPAID_ONLY");
    });
  });

  it("shows the score only with 3 or more merchants", async () => {
    await withHarness(make, async (store) => {
      for (const l of ["a", "b", "c"] as const) await report(store, l, [event({ phone: "03005555555" })]);
      const r = await check(store, "d", "03005555555");
      expect(typeof r.score).toBe("number");
      expect(r.network_signal?.vendor_count_band).toBe("2-4");
    });
  });

  it("applies the vendor's own history rule", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [refusal({ phone: "03006666666" }), refusal({ phone: "03006666666" })]);
      const own = await check(store, "a", "03006666666");
      expect(own.recommended_action).toBe("PREPAID_ONLY");
      expect(own.your_history).toMatchObject({ orders: 2, user_fault: 2 });
    });
  });

  it("answers an unknown phone like a thin-data customer", async () => {
    await withHarness(make, async (store) => {
      await report(store, "a", [event({ phone: "03007777777" })]);
      expect(await check(store, "c", "03007777777")).toEqual(await check(store, "c", "03008888888"));
    });
  });

  it("saves, counts and lists vendor applications", async () => {
    await withHarness(make, async (store) => {
      const base = {
        legalName: "Acme Traders Pvt Ltd",
        displayName: "Acme",
        category: "ecommerce" as const,
        businessType: "PVT_LTD" as const,
        platform: "WOOCOMMERCE" as const,
        storeUrl: null,
        contactName: "Ali",
        ipHash: "hash-1",
        status: "NEW" as const,
      };
      await store.saveApplication({ ...base, id: "00000000-0000-4000-8000-000000000001", contactEmail: "a@shop.pk", createdAt: new Date(NOW.getTime() - 2 * 3_600_000) });
      await store.saveApplication({ ...base, id: "00000000-0000-4000-8000-000000000002", contactEmail: "a@shop.pk", createdAt: NOW });
      await store.saveApplication({ ...base, id: "00000000-0000-4000-8000-000000000003", contactEmail: "b@shop.pk", createdAt: NOW, ipHash: "hash-2" });

      const hourAgo = new Date(NOW.getTime() - 3_600_000);
      expect(await store.countApplicationsSince({ contactEmail: "a@shop.pk" }, hourAgo)).toBe(1);
      expect(await store.countApplicationsSince({ contactEmail: "a@shop.pk" }, new Date(0))).toBe(2);
      expect(await store.countApplicationsSince({ ipHash: "hash-1" }, new Date(0))).toBe(2);

      const list = await store.listApplications(2);
      expect(list).toHaveLength(2);
      expect(list.every((a) => a.createdAt.getTime() === NOW.getTime())).toBe(true);
    });
  });

  it("counts lookups for the quota", async () => {
    await withHarness(make, async (store) => {
      for (let i = 0; i < 3; i++) await check(store, "a", "03009999999");
      expect(await store.countLookupsSince(VENDOR_ID.a, new Date(NOW.getTime() - 60_000))).toBe(3);
    });
  });
});
